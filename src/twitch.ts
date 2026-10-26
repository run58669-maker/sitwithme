import { readFile, writeFile } from "node:fs/promises";
import { WebSocket } from "ws";

const TWITCH_API = "https://api.twitch.tv/helix";
const TWITCH_AUTH = "https://id.twitch.tv/oauth2";
const EVENTSUB_URL = "wss://eventsub.wss.twitch.tv/ws";
export const REQUIRED_SCOPES = ["user:read:chat", "user:bot", "channel:bot"] as const;

interface StoredToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string[];
}

interface ValidateResponse {
  client_id: string;
  login: string;
  scopes: string[];
  user_id: string;
  expires_in: number;
}

interface EventSubEnvelope {
  metadata?: { message_type?: string };
  payload?: {
    session?: { id: string; reconnect_url?: string; keepalive_timeout_seconds?: number };
    event?: {
      chatter_user_id?: string;
      chatter_user_name?: string;
      message?: { text?: string };
    };
    subscription?: { status?: string; type?: string };
  };
}

export interface TwitchConfig {
  clientId: string;
  clientSecret: string;
  channel: string;
  botUser?: string;
  redirectUri: string;
  tokenFile: string;
}

export interface TwitchChatMessage {
  userId: string;
  displayName: string;
  text: string;
}

function tokenFromResponse(data: TokenResponse, previousRefreshToken?: string): StoredToken {
  const refreshToken = data.refresh_token ?? previousRefreshToken;
  if (!refreshToken) throw new Error("Twitch did not return a refresh token.");
  return {
    accessToken: data.access_token,
    refreshToken,
    expiresAt: Date.now() + data.expires_in * 1_000,
    scopes: data.scope,
  };
}

async function twitchRequest<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Twitch request failed (${response.status}): ${body}`);
  }
  return (await response.json()) as T;
}

export class TwitchAuth {
  constructor(private readonly config: TwitchConfig) {}

  authorizationUrl(state: string): string {
    const query = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      scope: REQUIRED_SCOPES.join(" "),
      state,
      force_verify: "true",
    });
    return `${TWITCH_AUTH}/authorize?${query.toString()}`;
  }

  async exchangeCode(code: string): Promise<StoredToken> {
    const data = await twitchRequest<TokenResponse>(`${TWITCH_AUTH}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: this.config.redirectUri,
      }),
    });
    const token = tokenFromResponse(data);
    await this.saveToken(token);
    return token;
  }

  async getValidUserToken(): Promise<StoredToken | null> {
    const token = await this.loadToken();
    if (!token) return null;
    if (token.expiresAt > Date.now() + 60_000) return token;

    const data = await twitchRequest<TokenResponse>(`${TWITCH_AUTH}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      }),
    });
    const refreshed = tokenFromResponse(data, token.refreshToken);
    await this.saveToken(refreshed);
    return refreshed;
  }

  async validate(accessToken: string): Promise<ValidateResponse> {
    return twitchRequest<ValidateResponse>(`${TWITCH_AUTH}/validate`, {
      headers: { Authorization: `OAuth ${accessToken}` },
    });
  }

  private async loadToken(): Promise<StoredToken | null> {
    try {
      const raw = await readFile(this.config.tokenFile, "utf8");
      return JSON.parse(raw) as StoredToken;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  private async saveToken(token: StoredToken): Promise<void> {
    await writeFile(this.config.tokenFile, `${JSON.stringify(token, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  }
}

export class TwitchEventSub {
  private socket: WebSocket | null = null;
  private stopped = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: TwitchConfig,
    private readonly auth: TwitchAuth,
    private readonly onMessage: (message: TwitchChatMessage) => void,
  ) {}

  async start(): Promise<void> {
    this.stopped = false;
    await this.connect(EVENTSUB_URL, true);
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
  }

  private async connect(url: string, shouldSubscribe: boolean): Promise<void> {
    const token = await this.auth.getValidUserToken();
    if (!token) {
      throw new Error("No Twitch user token. Open /auth to authorize the bot.");
    }

    const validation = await this.auth.validate(token.accessToken);
    const missingScopes = REQUIRED_SCOPES.filter((scope) => !validation.scopes.includes(scope));
    if (missingScopes.length > 0) {
      throw new Error(`Twitch token is missing scopes: ${missingScopes.join(", ")}`);
    }
    if (this.config.botUser && validation.login.toLowerCase() !== this.config.botUser.toLowerCase()) {
      throw new Error(
        `TWITCH_BOT_USER is ${this.config.botUser}, but the authorized user is ${validation.login}.`,
      );
    }

    const appToken = await this.getAppToken();
    const broadcasterId = await this.lookupUserId(this.config.channel, appToken);
    const socket = new WebSocket(url);
    this.socket = socket;

    socket.on("open", () => console.log("[twitch] EventSub WebSocket connected."));
    socket.on("message", async (data) => {
      try {
        const envelope = JSON.parse(data.toString()) as EventSubEnvelope;
        const messageType = envelope.metadata?.message_type;

        if (messageType === "session_welcome") {
          const sessionId = envelope.payload?.session?.id;
          if (!sessionId) throw new Error("EventSub welcome message did not include a session id.");
          if (shouldSubscribe) {
            const currentToken = await this.auth.getValidUserToken();
            if (!currentToken) throw new Error("Twitch user token disappeared before subscription.");
            await this.subscribe(sessionId, broadcasterId, validation.user_id, currentToken.accessToken);
          }
          return;
        }

        if (messageType === "session_reconnect") {
          const reconnectUrl = envelope.payload?.session?.reconnect_url;
          if (reconnectUrl) await this.connect(reconnectUrl, false);
          return;
        }

        if (messageType === "notification") {
          const event = envelope.payload?.event;
          if (event?.chatter_user_id && event.chatter_user_name && event.message?.text) {
            this.onMessage({
              userId: event.chatter_user_id,
              displayName: event.chatter_user_name,
              text: event.message.text,
            });
          }
          return;
        }

        if (messageType === "revocation") {
          console.error(
            `[twitch] Subscription revoked: ${envelope.payload?.subscription?.status ?? "unknown"}`,
          );
        }
      } catch (error) {
        console.error("[twitch] EventSub message error:", error);
      }
    });

    socket.on("error", (error) => console.error("[twitch] WebSocket error:", error.message));
    socket.on("close", (code) => {
      if (this.socket !== socket) return;
      this.socket = null;
      if (!this.stopped) {
        console.warn(`[twitch] WebSocket closed (${code}); reconnecting in 3 seconds.`);
        this.scheduleReconnect();
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect(EVENTSUB_URL, true).catch((error) => {
        console.error("[twitch] Reconnect failed:", error);
        this.scheduleReconnect();
      });
    }, 3_000);
  }

  private async getAppToken(): Promise<string> {
    const data = await twitchRequest<TokenResponse>(`${TWITCH_AUTH}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: "client_credentials",
      }),
    });
    return data.access_token;
  }

  private async lookupUserId(login: string, appToken: string): Promise<string> {
    const data = await twitchRequest<{ data: Array<{ id: string }> }>(
      `${TWITCH_API}/users?login=${encodeURIComponent(login)}`,
      {
        headers: {
          Authorization: `Bearer ${appToken}`,
          "Client-Id": this.config.clientId,
        },
      },
    );
    const id = data.data[0]?.id;
    if (!id) throw new Error(`Twitch user not found: ${login}`);
    return id;
  }

  private async subscribe(
    sessionId: string,
    broadcasterId: string,
    userId: string,
    userToken: string,
  ): Promise<void> {
    await twitchRequest(`${TWITCH_API}/eventsub/subscriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userToken}`,
        "Client-Id": this.config.clientId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "channel.chat.message",
        version: "1",
        condition: {
          broadcaster_user_id: broadcasterId,
          user_id: userId,
        },
        transport: {
          method: "websocket",
          session_id: sessionId,
        },
      }),
    });
    console.log(`[twitch] Subscribed to chat for ${this.config.channel}.`);
  }
}
