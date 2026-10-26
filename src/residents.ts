import { LinePicker } from "./lines.js";
import type { RoomSnapshot } from "./room.js";

export type ResidentAction =
  | "quiet"
  | "standing"
  | "walking"
  | "sitting"
  | "stretching"
  | "retreating";

export interface ResidentBubble {
  text: string;
  expiresAt: number;
}

export interface ResidentSnapshot {
  id: string;
  name: string;
  paletteIndex: number;
  action: ResidentAction;
  x: number;
  y: number;
  chairIndex: number | null;
  bubble: ResidentBubble | null;
}

interface Motion {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  startedAt: number;
  endsAt: number;
}

interface ResidentRecord extends ResidentSnapshot {
  motion: Motion | null;
  nextActionAt: number;
}

interface PendingReply {
  residentIndex: number;
  text: string;
  showAt: number;
}

const DEFAULT_RESIDENTS = ["Mori", "Pip", "Tabby"] as const;
const ACTIVITY_SPOTS = [
  { x: 165, y: 350 },
  { x: 264, y: 322 },
  { x: 480, y: 318 },
  { x: 690, y: 326 },
  { x: 805, y: 350 },
] as const;

export function parseResidentNames(raw: string | undefined): string[] {
  const names = (raw ?? DEFAULT_RESIDENTS.join(","))
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  if (names.length < 2 || names.length > 3) {
    throw new Error("RESIDENTS must contain 2 or 3 comma-separated names.");
  }
  return names;
}

function chairPosition(chairCount: number, chairIndex: number): { x: number; y: number } {
  const row = Math.floor(chairIndex / 8);
  const rowCount = Math.min(8, chairCount - row * 8);
  const rowStart = 480 - ((rowCount - 1) * 92) / 2;
  return { x: rowStart + (chairIndex % 8) * 92, y: 372 + row * 68 };
}

export class ResidentManager {
  private readonly residents: ResidentRecord[];
  private readonly linePicker: LinePicker;
  private active = false;
  private nextDialogueAt = Number.POSITIVE_INFINITY;
  private pendingReply: PendingReply | null = null;

  constructor(
    names: readonly string[],
    private readonly chairCount: number,
    linePicker = new LinePicker(),
    private readonly random: () => number = Math.random,
    now = Date.now(),
  ) {
    this.linePicker = linePicker;
    this.residents = names.map((name, index) => ({
      id: `resident-${index + 1}`,
      name,
      paletteIndex: index,
      action: "quiet",
      x: index % 2 === 0 ? 72 : 888,
      y: 342 - index * 12,
      chairIndex: null,
      bubble: null,
      motion: null,
      nextActionAt: now,
    }));
  }

  enterIdle(now = Date.now()): void {
    if (this.active) return;
    this.active = true;
    this.pendingReply = null;
    this.nextDialogueAt = now + 1_800;
    this.residents.forEach((resident, index) => {
      resident.chairIndex = null;
      resident.bubble = null;
      const target = ACTIVITY_SPOTS[index % ACTIVITY_SPOTS.length] as { x: number; y: number };
      this.beginMotion(resident, target.x, target.y, now, 1_200 + index * 250, "walking");
      resident.nextActionAt = now + 2_400 + index * 550;
    });
  }

  exitIdle(now = Date.now()): void {
    if (!this.active && this.residents.every((resident) => resident.action === "quiet")) return;
    this.active = false;
    this.pendingReply = null;
    this.nextDialogueAt = Number.POSITIVE_INFINITY;
    this.residents.forEach((resident, index) => {
      resident.bubble = null;
      resident.chairIndex = null;
      const targetX = index % 2 === 0 ? 72 : 888;
      this.beginMotion(resident, targetX, 342 - index * 12, now, 1_700 + index * 100, "retreating");
      resident.nextActionAt = Number.POSITIVE_INFINITY;
    });
  }

  update(now: number, room: RoomSnapshot): boolean {
    let changed = false;

    for (const resident of this.residents) {
      if (resident.bubble && resident.bubble.expiresAt <= now) {
        resident.bubble = null;
        changed = true;
      }
      if (resident.motion) {
        const duration = resident.motion.endsAt - resident.motion.startedAt;
        const progress = Math.min(1, Math.max(0, (now - resident.motion.startedAt) / duration));
        resident.x = resident.motion.fromX + (resident.motion.toX - resident.motion.fromX) * progress;
        resident.y = resident.motion.fromY + (resident.motion.toY - resident.motion.fromY) * progress;
        changed = true;
        if (progress >= 1) {
          resident.motion = null;
          resident.action = this.active ? "standing" : "quiet";
        }
      }

      if (
        resident.chairIndex !== null &&
        (room.seats[resident.chairIndex] ||
          this.residents.some(
            (other) => other !== resident && other.chairIndex === resident.chairIndex,
          ))
      ) {
        resident.chairIndex = null;
        const spot = this.pickSpot();
        this.beginMotion(resident, spot.x, spot.y, now, 1_100, "walking");
        resident.nextActionAt = now + 2_500;
        changed = true;
      }
    }

    if (!this.active) return changed;

    if (this.pendingReply && now >= this.pendingReply.showAt) {
      const responder = this.residents[this.pendingReply.residentIndex];
      if (responder) {
        responder.bubble = { text: this.pendingReply.text, expiresAt: now + 3_600 };
        changed = true;
      }
      this.pendingReply = null;
    }

    if (now >= this.nextDialogueAt) {
      this.startDialogue(now);
      changed = true;
    }

    for (const resident of this.residents) {
      if (resident.motion || now < resident.nextActionAt) continue;
      this.chooseAction(resident, room, now);
      changed = true;
    }

    return changed;
  }

  snapshot(): ResidentSnapshot[] {
    return this.residents.map(({ motion: _motion, nextActionAt: _nextActionAt, ...resident }) => ({
      ...resident,
      bubble: resident.bubble ? { ...resident.bubble } : null,
      x: Math.round(resident.x * 10) / 10,
      y: Math.round(resident.y * 10) / 10,
    }));
  }

  private chooseAction(resident: ResidentRecord, room: RoomSnapshot, now: number): void {
    const roll = this.random();
    const availableChairs = room.seats
      .map((viewer, index) => ({ viewer, index }))
      .filter(
        ({ viewer, index }) =>
          viewer === null && !this.residents.some((other) => other.chairIndex === index),
      )
      .map(({ index }) => index);

    if (roll < 0.38 && availableChairs.length > 0) {
      const index = availableChairs[Math.floor(this.random() * availableChairs.length)];
      if (index !== undefined) {
        const position = chairPosition(this.chairCount, index);
        resident.x = position.x;
        resident.y = position.y;
        resident.chairIndex = index;
        resident.action = "sitting";
        resident.nextActionAt = now + this.randomBetween(4_000, 7_000);
        return;
      }
    }

    resident.chairIndex = null;
    if (roll < 0.76) {
      const spot = this.pickSpot();
      this.beginMotion(resident, spot.x, spot.y, now, this.randomBetween(1_500, 3_000), "walking");
      resident.nextActionAt = now + this.randomBetween(3_500, 6_000);
      return;
    }

    resident.action = "stretching";
    resident.nextActionAt = now + this.randomBetween(1_500, 2_300);
  }

  private startDialogue(now: number): void {
    const line = this.linePicker.pick();
    const speakerIndex = Math.floor(this.random() * this.residents.length);
    const speaker = this.residents[speakerIndex];
    if (!speaker) return;
    speaker.bubble = { text: line.first, expiresAt: now + (line.second ? 2_400 : 4_200) };

    if (line.second) {
      const responderIndex = (speakerIndex + 1 + Math.floor(this.random() * (this.residents.length - 1))) %
        this.residents.length;
      this.pendingReply = {
        residentIndex: responderIndex,
        text: line.second,
        showAt: now + 2_200,
      };
    }
    this.nextDialogueAt = now + this.randomBetween(6_500, 10_000);
  }

  private beginMotion(
    resident: ResidentRecord,
    toX: number,
    toY: number,
    now: number,
    duration: number,
    action: "walking" | "retreating",
  ): void {
    resident.action = action;
    resident.motion = {
      fromX: resident.x,
      fromY: resident.y,
      toX,
      toY,
      startedAt: now,
      endsAt: now + duration,
    };
  }

  private pickSpot(): { x: number; y: number } {
    const spot = ACTIVITY_SPOTS[Math.floor(this.random() * ACTIVITY_SPOTS.length)];
    return spot ?? ACTIVITY_SPOTS[0];
  }

  private randomBetween(minimum: number, maximum: number): number {
    return minimum + Math.floor(this.random() * (maximum - minimum));
  }
}
