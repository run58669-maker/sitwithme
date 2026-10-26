export type RoomCommand = "sit" | "leave" | "wave";

export interface ChatUser {
  id: string;
  displayName: string;
}

export interface SeatedViewer extends ChatUser {
  chairIndex: number;
  waveUntil?: number;
  bubble?: {
    text: string;
    expiresAt: number;
  };
}

export interface RoomSnapshot {
  type: "state";
  chairs: number;
  seats: Array<SeatedViewer | null>;
}

export interface RoomEvent {
  type: "event";
  event: RoomCommand;
  user: ChatUser;
  chairIndex: number;
  waveUntil?: number;
}

export function parseCommand(message: string): RoomCommand | null {
  const command = message.trim().split(/\s+/, 1)[0]?.toLowerCase();
  if (command === "!sit") return "sit";
  if (command === "!leave") return "leave";
  if (command === "!wave") return "wave";
  return null;
}

export function formatChatBubble(message: string, maximumLength = 40): string {
  const characters = Array.from(message.trim());
  const truncated =
    characters.length > maximumLength
      ? `${characters.slice(0, Math.max(0, maximumLength - 1)).join("")}…`
      : characters.join("");
  return truncated
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export class Room {
  private readonly seats: Array<SeatedViewer | null>;

  constructor(readonly chairCount = 6) {
    if (!Number.isInteger(chairCount) || chairCount < 1 || chairCount > 24) {
      throw new Error("CHAIRS must be an integer between 1 and 24.");
    }
    this.seats = Array.from({ length: chairCount }, () => null);
  }

  snapshot(now = Date.now()): RoomSnapshot {
    for (const viewer of this.seats) {
      if (viewer?.bubble && viewer.bubble.expiresAt <= now) delete viewer.bubble;
    }
    return {
      type: "state",
      chairs: this.chairCount,
      seats: this.seats.map((viewer) => (viewer ? { ...viewer } : null)),
    };
  }

  showChatBubble(userId: string, message: string, now = Date.now()): boolean {
    const viewer = this.seats.find((seat) => seat?.id === userId);
    if (!viewer) return false;
    viewer.bubble = {
      text: formatChatBubble(message),
      expiresAt: now + 4_000,
    };
    return true;
  }

  apply(user: ChatUser, command: RoomCommand, now = Date.now()): RoomEvent | null {
    const currentIndex = this.seats.findIndex((viewer) => viewer?.id === user.id);

    if (command === "sit") {
      if (currentIndex !== -1) return null;
      const chairIndex = this.seats.findIndex((viewer) => viewer === null);
      if (chairIndex === -1) return null;
      this.seats[chairIndex] = { ...user, chairIndex };
      return { type: "event", event: "sit", user, chairIndex };
    }

    if (currentIndex === -1) return null;

    if (command === "leave") {
      this.seats[currentIndex] = null;
      return { type: "event", event: "leave", user, chairIndex: currentIndex };
    }

    const waveUntil = now + 1_500;
    const viewer = this.seats[currentIndex];
    if (!viewer) return null;
    viewer.waveUntil = waveUntil;
    return {
      type: "event",
      event: "wave",
      user,
      chairIndex: currentIndex,
      waveUntil,
    };
  }
}
