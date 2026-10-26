import { promises as fs } from "node:fs";
import path from "node:path";
import { parseResidentNames } from "./residents.js";

export const PALETTE_PRESETS = ["cozy-orange", "night-blue", "forest", "candy"] as const;
export type PalettePreset = (typeof PALETTE_PRESETS)[number];

export interface AppSettings {
  chairCount: number;
  idleMinutes: number;
  residentNames: string[];
  palette: PalettePreset;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseSettings(value: unknown): AppSettings {
  if (!isRecord(value)) throw new Error("Settings must be a JSON object.");

  const chairCount = Number(value.chairCount);
  if (!Number.isInteger(chairCount) || chairCount < 2 || chairCount > 12) {
    throw new Error("Chair count must be an integer from 2 to 12.");
  }

  const idleMinutes = Number(value.idleMinutes);
  if (!Number.isFinite(idleMinutes) || idleMinutes <= 0 || idleMinutes > 1_440) {
    throw new Error("Idle minutes must be greater than 0 and at most 1440.");
  }

  const residentSource = Array.isArray(value.residentNames)
    ? value.residentNames.join(",")
    : String(value.residentNames ?? "");
  const residentNames = parseResidentNames(residentSource);
  if (residentNames.some((name) => Array.from(name).length > 24)) {
    throw new Error("Resident names must be 24 characters or fewer.");
  }

  const palette = String(value.palette ?? "");
  if (!PALETTE_PRESETS.includes(palette as PalettePreset)) {
    throw new Error(`Palette must be one of: ${PALETTE_PRESETS.join(", ")}.`);
  }

  return { chairCount, idleMinutes, residentNames, palette: palette as PalettePreset };
}

export function settingsFromEnvironment(env: NodeJS.ProcessEnv = process.env): AppSettings {
  return parseSettings({
    chairCount: env.CHAIRS ?? "6",
    idleMinutes: env.IDLE_MINUTES ?? "3",
    residentNames: env.RESIDENTS ?? "Mori,Pip,Tabby",
    palette: env.ROOM_PALETTE ?? "cozy-orange",
  });
}

export async function loadSettings(filePath: string, defaults: AppSettings): Promise<AppSettings> {
  try {
    const stored = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
    return parseSettings({ ...defaults, ...(isRecord(stored) ? stored : {}) });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return defaults;
    throw new Error(`Could not load ${path.basename(filePath)}: ${(error as Error).message}`);
  }
}

export async function saveSettings(filePath: string, settings: AppSettings): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(settings, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}
