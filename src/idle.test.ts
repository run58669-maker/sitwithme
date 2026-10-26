import assert from "node:assert/strict";
import test from "node:test";
import { IdleStateMachine } from "./idle.js";

test("enters idle only after the configured silence", () => {
  const idle = new IdleStateMachine(15_000, 1_000);

  assert.equal(idle.update(15_999), null);
  assert.equal(idle.snapshot().idle, false);
  assert.equal(idle.update(16_000), "enter");
  assert.equal(idle.snapshot().idle, true);
  assert.equal(idle.update(20_000), null);
});

test("any human message exits idle and restarts the clock", () => {
  const idle = new IdleStateMachine(1_500, 0);

  assert.equal(idle.update(1_500), "enter");
  assert.equal(idle.recordHumanMessage(2_000), "exit");
  assert.deepEqual(idle.snapshot(), {
    idle: false,
    idleSince: null,
    lastHumanMessageAt: 2_000,
    nextIdleAt: 3_500,
  });
  assert.equal(idle.update(3_499), null);
  assert.equal(idle.update(3_500), "enter");
});

test("fractional-minute thresholds can be represented exactly", () => {
  const fifteenSeconds = 0.25 * 60_000;
  const idle = new IdleStateMachine(fifteenSeconds, 10_000);

  assert.equal(idle.update(24_999), null);
  assert.equal(idle.update(25_000), "enter");
});

test("can be forced idle and can apply a shorter threshold", () => {
  const forced = new IdleStateMachine(60_000, 0);
  assert.equal(forced.forceIdle(2_000), "enter");
  assert.equal(forced.snapshot().idleSince, 2_000);

  const reconfigured = new IdleStateMachine(60_000, 0);
  assert.equal(reconfigured.setThresholdMs(5_000, 5_000), "enter");
});
