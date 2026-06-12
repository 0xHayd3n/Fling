import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildLongPressArgs } from "../dist/tools/long-press-by-text.js";

describe("buildLongPressArgs", () => {
  it("emits a zero-length swipe held for the given duration", () => {
    const argv = buildLongPressArgs(["-s", "emulator-5554"], 100, 200, 1000);
    assert.deepEqual(argv, [
      "-s",
      "emulator-5554",
      "shell",
      "input",
      "swipe",
      "100",
      "200",
      "100",
      "200",
      "1000",
    ]);
  });

  it("uses a custom duration when provided", () => {
    const argv = buildLongPressArgs([], 50, 50, 2500);
    assert.equal(argv[argv.length - 1], "2500");
  });
});
