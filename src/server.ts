import "dotenv/config";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocket, WebSocketServer } from "ws";
import { parseCommand, Room, type RoomEvent } from "./room.js";
import { TwitchAuth, TwitchEventSub, type TwitchChatMessage, type TwitchConfig } from "./twitch.js";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const chairCount = Number.parseInt(process.env.CHAIRS ?? "6", 10);
const fakeChat = process.env.FAKE_CHAT === "1";
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const redirectUri = `http://localhost:${port}/callback`;
const room = new Room(chairCount);
const app = express();
const server = createServer(app);
const overlaySockets = new WebSocketServer({ noServer: true });
const oauthStates = new Set<string>();

const twitchConfig: TwitchConfig = {
  clientId: process.env.TWITCH_CLIENT_ID ?? "",
  clientSecret: process.env.TWITCH_CLIENT_SECRET ?? "",
  channel: process.env.TWITCH_CHANNEL ?? "",
  botUser: process.env.TWITCH_BOT_USER || undefined,
  redirectUri,
  tokenFile: path.join(projectRoot, ".tokens.json"),
};

const twitchAuth = new TwitchAuth(twitchConfig);
let twitchClient: TwitchEventSub | null = null;
let twitchStarting = false;

function send(socket: WebSocket, payload: unknown): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function broadcast(payload: unknown): void {
  for (const client of overlaySockets.clients) send(client, payload);
}

function handleChat(message: TwitchChatMessage): void {
  console.log(`[chat] ${message.displayName}: ${message.text}`);
  const command = parseCommand(message.text);
  if (!command) return;
  const user = { id: message.userId, displayName: message.displayName };
  const event = room.apply(user, command);
  if (!event) return;
  broadcast(event);
  broadcast(room.snapshot());
}

function twitchConfigured(): boolean {
  return Boolean(twitchConfig.clientId && twitchConfig.clientSecret && twitchConfig.channel);
}

async function startTwitch(): Promise<void> {
  if (fakeChat || twitchClient || twitchStarting || !twitchConfigured()) return;
  twitchStarting = true;
  const client = new TwitchEventSub(twitchConfig, twitchAuth, handleChat);
  try {
    await client.start();
    twitchClient = client;
  } finally {
    twitchStarting = false;
  }
}

app.get("/auth", (_request, response) => {
  if (!twitchConfigured()) {
    response.status(503).send("Set TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, and TWITCH_CHANNEL first.");
    return;
  }
  const state = randomBytes(24).toString("hex");
  oauthStates.add(state);
  response.redirect(twitchAuth.authorizationUrl(state));
});

app.get("/callback", async (request, response) => {
  const code = typeof request.query.code === "string" ? request.query.code : "";
  const state = typeof request.query.state === "string" ? request.query.state : "";
  if (!code || !state || !oauthStates.delete(state)) {
    response.status(400).send("Invalid OAuth callback.");
    return;
  }

  try {
    await twitchAuth.exchangeCode(code);
    response.type("html").send("<p>Twitch authorization saved. You can close this window.</p>");
    void startTwitch().catch((error) => console.error("[twitch] Startup failed:", error));
  } catch (error) {
    console.error("[oauth] Token exchange failed:", error);
    response.status(500).send("Twitch authorization failed. Check the server log.");
  }
});

app.use(express.static(path.join(projectRoot, "public")));

server.on("upgrade", (request, socket, head) => {
  const pathname = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`).pathname;
  if (pathname !== "/ws") {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
    return;
  }
  overlaySockets.handleUpgrade(request, socket, head, (webSocket) => {
    overlaySockets.emit("connection", webSocket, request);
  });
});

overlaySockets.on("connection", (socket) => send(socket, room.snapshot()));

function startFakeChat(): void {
  const messages: Array<{ delay: number; userId: string; displayName: string; text: string }> = [
    { delay: 300, userId: "fake-1", displayName: "mossbyte", text: "!sit" },
    { delay: 900, userId: "fake-2", displayName: "lumen", text: "!sit" },
    { delay: 1_500, userId: "fake-1", displayName: "mossbyte", text: "!wave" },
    { delay: 2_100, userId: "fake-3", displayName: "orbitcat", text: "!sit" },
    { delay: 3_000, userId: "fake-2", displayName: "lumen", text: "!leave" },
    { delay: 3_600, userId: "fake-2", displayName: "lumen", text: "!sit" },
  ];
  for (const message of messages) {
    setTimeout(() => handleChat(message), message.delay);
  }
  setInterval(() => {
    handleChat({ userId: "fake-1", displayName: "mossbyte", text: "!wave" });
  }, 6_000);
}

server.listen(port, () => {
  console.log(`[server] Overlay: http://localhost:${port}/overlay.html`);
  console.log(`[server] Overlay WebSocket: ws://localhost:${port}/ws`);
  if (fakeChat) {
    console.log("[fake-chat] Enabled; Twitch is not contacted.");
    startFakeChat();
    return;
  }
  if (!twitchConfigured()) {
    console.warn("[twitch] Missing configuration. Copy .env.example to .env and fill in Twitch values.");
    return;
  }
  console.log(`[twitch] If needed, authorize at http://localhost:${port}/auth`);
  void startTwitch().catch((error) => console.error("[twitch] Startup failed:", error));
});

function shutdown(): void {
  twitchClient?.stop();
  overlaySockets.close();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
