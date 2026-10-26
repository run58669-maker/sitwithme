import assert from "node:assert/strict";
import test from "node:test";
import { parseCommand, Room } from "./room.js";

test("parses supported commands case-insensitively", () => {
  assert.equal(parseCommand(" !SIT "), "sit");
  assert.equal(parseCommand("!leave now"), "leave");
  assert.equal(parseCommand("!wave"), "wave");
  assert.equal(parseCommand("hello"), null);
});

test("sits, waves, and removes a viewer", () => {
  const room = new Room(2);
  const user = { id: "1", displayName: "mossbyte" };

  assert.equal(room.apply(user, "sit")?.chairIndex, 0);
  assert.equal(room.snapshot().seats[0]?.displayName, "mossbyte");
  assert.equal(room.apply(user, "wave", 1_000)?.waveUntil, 2_500);
  assert.equal(room.apply(user, "leave")?.event, "leave");
  assert.equal(room.snapshot().seats[0], null);
});

test("does not duplicate a viewer or overfill the room", () => {
  const room = new Room(1);
  const first = { id: "1", displayName: "first" };
  const second = { id: "2", displayName: "second" };

  assert.equal(room.apply(first, "sit")?.event, "sit");
  assert.equal(room.apply(first, "sit"), null);
  assert.equal(room.apply(second, "sit"), null);
});
