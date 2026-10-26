import assert from "node:assert/strict";
import test from "node:test";
import { LinePicker, SCRIPTED_LINES } from "./lines.js";

test("the cozy line catalog has at least 60 short lines", () => {
  const allText = SCRIPTED_LINES.flatMap((line) =>
    line.second ? [line.first, line.second] : [line.first],
  );

  assert.ok(allText.length >= 60);
  assert.ok(SCRIPTED_LINES.some((line) => line.second));
  for (const line of allText) {
    assert.ok(line.length <= 50, `Line is too long: ${line}`);
  }
});

test("the picker never repeats an entry from the previous 15 picks", () => {
  const picker = new LinePicker(SCRIPTED_LINES, () => 0, 15);
  const picks = Array.from({ length: 80 }, () => picker.pick());

  for (let index = 0; index < picks.length; index += 1) {
    const recent = picks.slice(Math.max(0, index - 15), index);
    assert.ok(!recent.includes(picks[index] as (typeof picks)[number]));
  }
});
