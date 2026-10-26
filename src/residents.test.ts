import assert from "node:assert/strict";
import test from "node:test";
import { LinePicker, SCRIPTED_LINES } from "./lines.js";
import { parseResidentNames, ResidentManager } from "./residents.js";
import { Room } from "./room.js";

test("resident names default to three and accept two configured names", () => {
  assert.deepEqual(parseResidentNames(undefined), ["Mori", "Pip", "Tabby"]);
  assert.deepEqual(parseResidentNames("Fern, Ash"), ["Fern", "Ash"]);
  assert.throws(() => parseResidentNames("OnlyOne"), /2 or 3/);
});

test("residents retreat and become quiet within two seconds", () => {
  const room = new Room(6);
  const picker = new LinePicker(SCRIPTED_LINES, () => 0);
  const residents = new ResidentManager(["Mori", "Pip"], 6, picker, () => 0, 0);

  residents.enterIdle(0);
  residents.update(1_500, room.snapshot(1_500));
  assert.ok(residents.snapshot().every((resident) => resident.action !== "quiet"));

  residents.exitIdle(2_000);
  residents.update(3_999, room.snapshot(3_999));
  assert.ok(residents.snapshot().every((resident) => resident.action === "quiet"));
  assert.ok(residents.snapshot().every((resident) => resident.bubble === null));
});

test("a resident never keeps a chair claimed by a viewer", () => {
  const room = new Room(1);
  const picker = new LinePicker(SCRIPTED_LINES, () => 0);
  const residents = new ResidentManager(["Mori", "Pip"], 1, picker, () => 0, 0);
  residents.enterIdle(0);
  residents.update(3_000, room.snapshot(3_000));
  assert.ok(residents.snapshot().some((resident) => resident.chairIndex === 0));
  residents.update(6_000, room.snapshot(6_000));

  room.apply({ id: "viewer", displayName: "viewer" }, "sit", 6_100);
  residents.update(6_100, room.snapshot(6_100));
  assert.ok(residents.snapshot().every((resident) => resident.chairIndex !== 0));
});

test("residents can stretch during idle activity", () => {
  const room = new Room(2);
  const picker = new LinePicker(SCRIPTED_LINES, () => 0);
  const residents = new ResidentManager(["Mori", "Pip"], 2, picker, () => 0.9, 0);

  residents.enterIdle(0);
  residents.update(3_000, room.snapshot(3_000));
  assert.ok(residents.snapshot().some((resident) => resident.action === "stretching"));
});

test("a two-line script is handed from one resident to another", () => {
  const room = new Room(2);
  const scripts = Array.from({ length: 16 }, (_value, index) =>
    index === 0
      ? { first: "First line.", second: "Second line." }
      : { first: `Spare line ${index}.` },
  );
  const picker = new LinePicker(scripts, () => 0);
  const residents = new ResidentManager(["Mori", "Pip"], 2, picker, () => 0, 0);

  residents.enterIdle(0);
  residents.update(1_800, room.snapshot(1_800));
  assert.ok(residents.snapshot().some((resident) => resident.bubble?.text === "First line."));
  residents.update(4_000, room.snapshot(4_000));
  assert.ok(residents.snapshot().some((resident) => resident.bubble?.text === "Second line."));
});
