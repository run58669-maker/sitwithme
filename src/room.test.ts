import assert from "node:assert/strict";
import test from "node:test";
import { formatChatBubble, parseCommand, Room } from "./room.js";

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

test("shows an escaped, truncated chat bubble for a seated viewer", () => {
  const room = new Room(1);
  room.apply({ id: "1", displayName: "viewer" }, "sit", 0);

  assert.equal(room.showChatBubble("1", `<b>${"x".repeat(50)}&`, 1_000), true);
  const bubble = room.snapshot(1_001).seats[0]?.bubble;
  assert.ok(bubble);
  assert.ok(!bubble.text.includes("<"));
  assert.ok(bubble.text.startsWith("&lt;b&gt;"));
  assert.equal(bubble.expiresAt, 5_000);
  assert.equal(room.snapshot(5_000).seats[0]?.bubble, undefined);
});

test("formats chat by Unicode characters before escaping", () => {
  const formatted = formatChatBubble("🙂".repeat(45));
  assert.equal(Array.from(formatted).length, 40);
  assert.ok(formatted.endsWith("…"));
});

test("resizes chairs while preserving viewers in seat order", () => {
  const room = new Room(3);
  room.apply({ id: "1", displayName: "first" }, "sit");
  room.apply({ id: "2", displayName: "second" }, "sit");

  room.resize(2);
  assert.equal(room.snapshot().chairs, 2);
  assert.deepEqual(
    room.snapshot().seats.map((viewer) => viewer?.displayName),
    ["first", "second"],
  );

  room.resize(4);
  assert.equal(room.snapshot().chairs, 4);
  assert.equal(room.snapshot().seats[2], null);
});
