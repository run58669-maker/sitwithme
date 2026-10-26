import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadSettings, parseSettings, saveSettings, settingsFromEnvironment } from "./settings.js";

test("parses panel settings and trims resident names", () => {
  assert.deepEqual(
    parseSettings({
      chairCount: 8,
      idleMinutes: 0.25,
      residentNames: [" Fern ", "Ash"],
      palette: "forest",
    }),
    {
      chairCount: 8,
      idleMinutes: 0.25,
      residentNames: ["Fern", "Ash"],
      palette: "forest",
    },
  );
});

test("rejects settings outside the supported panel range", () => {
  assert.throws(
    () =>
      parseSettings({
        chairCount: 13,
        idleMinutes: 3,
        residentNames: ["Mori", "Pip"],
        palette: "cozy-orange",
      }),
    /2 to 12/,
  );
});

test("reads runtime defaults from environment values", () => {
  assert.deepEqual(
    settingsFromEnvironment({
      CHAIRS: "4",
      IDLE_MINUTES: "1.5",
      RESIDENTS: "Mori,Pip",
      ROOM_PALETTE: "night-blue",
    }),
    {
      chairCount: 4,
      idleMinutes: 1.5,
      residentNames: ["Mori", "Pip"],
      palette: "night-blue",
    },
  );
});

test("persists settings as JSON and loads them again", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "sitwithme-settings-"));
  const filePath = path.join(directory, "settings.json");
  const settings = parseSettings({
    chairCount: 7,
    idleMinutes: 0.5,
    residentNames: ["Mori", "Pip", "Tabby"],
    palette: "candy",
  });

  try {
    await saveSettings(filePath, settings);
    assert.deepEqual(await loadSettings(filePath, settingsFromEnvironment({})), settings);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
