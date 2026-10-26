import "dotenv/config";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocket, WebSocketServer } from "ws";
import { IdleStateMachine } from "./idle.js";
import { parseResidentNames, ResidentManager } from "./residents.js";
import { parseCommand, Room } from "./room.js";
import { TwitchAuth, TwitchEventSub, type TwitchChatMessage, type TwitchConfig } from "./twitch.js";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const chairCount = Number.parseInt(process.env.CHAIRS ?? "6", 10);
const idleMinutes = Number(process.env.IDLE_MINUTES ?? "3");
const fakeChat = process.env.FAKE_CHAT === "1";
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const redirectUri = `http://localhost:${port}/callback`;
const room = new Room(chairCount);
const idle = new IdleStateMachine(idleMinutes * 60_000);
const residents = new ResidentManager(parseResidentNames(process.env.RESIDENTS), chairCount);
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

function stateSnapshot(now = Date.now()) {
  const idleState = idle.snapshot();
  return {
    ...room.snapshot(now),
    idle: idleState.idle,
    idleSince: idleState.idleSince,
    lastHumanMessageAt: idleState.lastHumanMessageAt,
    nextIdleAt: idleState.nextIdleAt,
    serverTime: now,
    residents: residents.snapshot(),
  };
}

function broadcastState(now = Date.now()): void {
  broadcast(stateSnapshot(now));
}

function handleChat(message: TwitchChatMessage): void {
  const now = Date.now();
  console.log(`[chat] ${message.displayName}: ${message.text}`);
  if (idle.recordHumanMessage(now) === "exit") {
    console.log("[idle] Human chat resumed; residents are stepping back.");
    residents.exitIdle(now);
  }

  const command = parseCommand(message.text);
  if (command) {
    const user = { id: message.userId, displayName: message.displayName };
    const event = room.apply(user, command, now);
    if (event) broadcast(event);
  } else {
    room.showChatBubble(message.userId, message.text, now);
  }

  residents.update(now, room.snapshot(now));
  broadcastState(now);
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

app.get("/api/state", (_request, response) => {
  const now = Date.now();
  const snapshot = stateSnapshot(now);
  const { type: _type, chairs, seats, ...activity } = snapshot;
  response.set("Cache-Control", "no-store").json({
    room: { chairs, seats },
    ...activity,
    idleMinutes,
  });
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

overlaySockets.on("connection", (socket) => send(socket, stateSnapshot()));

function startFakeChat(): void {
  const cycleMs = 30_000;
  const scheduleBurst = () => {
    const messages: Array<{ delay: number; userId: string; displayName: string; text: string }> = [
      { delay: 300, userId: "fake-1", displayName: "mossbyte", text: "!sit" },
      { delay: 900, userId: "fake-2", displayName: "lumen", text: "!sit" },
      { delay: 1_500, userId: "fake-1", displayName: "mossbyte", text: "The room feels warm." },
      { delay: 2_100, userId: "fake-3", displayName: "orbitcat", text: "!sit" },
      { delay: 3_100, userId: "fake-2", displayName: "lumen", text: "A good chair." },
      { delay: 4_400, userId: "fake-1", displayName: "mossbyte", text: "!wave" },
      { delay: 6_200, userId: "fake-3", displayName: "orbitcat", text: "Quiet for a bit." },
    ];
    for (const message of messages) setTimeout(() => handleChat(message), message.delay);
    setTimeout(scheduleBurst, cycleMs);
  };
  scheduleBurst();
}

const activityTimer = setInterval(() => {
  const now = Date.now();
  const transition = idle.update(now);
  if (transition === "enter") {
    console.log(`[idle] No human chat for ${idleMinutes} minute(s); residents are active.`);
    residents.enterIdle(now);
  }
  const changed = residents.update(now, room.snapshot(now));
  if (transition || changed) broadcastState(now);
}, 100);

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
  clearInterval(activityTimer);
  twitchClient?.stop();
  overlaySockets.close();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
