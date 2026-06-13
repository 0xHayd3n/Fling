import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildTapArgs,
  buildLongPressArgs,
  selectTapTarget,
} from "../dist/tools/tap-by-text.js";
import { node } from "./test-helpers.mjs";

describe("buildTapArgs", () => {
  it("returns the canonical adb tap argv", () => {
    const argv = buildTapArgs(["-s", "emulator-5554"], 610, 1203);
    assert.deepEqual(argv, [
      "-s",
      "emulator-5554",
      "shell",
      "input",
      "tap",
      "610",
      "1203",
    ]);
  });
});

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

describe("selectTapTarget", () => {
  it("returns null when no nodes match", () => {
    const result = selectTapTarget([node({ text: "Hi" })], {
      by: "text",
      value: "Missing",
    });
    assert.equal(result, null);
  });

  it("returns the clickable ancestor's center when match is a wrapped label", () => {
    const label = node({
      text: "Get started",
      bounds: { x1: 421, y1: 2195, x2: 799, y2: 2355 },
    });
    const button = node({
      clickable: true,
      bounds: { x1: 400, y1: 2150, x2: 820, y2: 2400 },
      center: { x: 610, y: 2275 },
    });
    const all = [button, label];
    const result = selectTapTarget(all, { by: "text", value: "Get started" });
    assert.ok(result);
    assert.equal(result.tap_x, 610);
    assert.equal(result.tap_y, 2275);
    assert.equal(result.fell_back_to_match, false);
    assert.equal(result.candidates_count, 1);
    assert.deepEqual(result.bounds, button.bounds);
  });

  it("falls back to the match itself when no clickable ancestor exists", () => {
    const label = node({
      text: "Just a label",
      bounds: { x1: 0, y1: 0, x2: 50, y2: 30 },
      center: { x: 25, y: 15 },
    });
    const result = selectTapTarget([label], {
      by: "text",
      value: "Just a label",
    });
    assert.ok(result);
    assert.equal(result.fell_back_to_match, true);
    assert.equal(result.tap_x, 25);
    assert.equal(result.tap_y, 15);
  });

  it("reports candidates_count when multiple matches exist", () => {
    const a = node({
      text: "Photos",
      clickable: true,
      bounds: { x1: 0, y1: 0, x2: 100, y2: 50 },
      center: { x: 50, y: 25 },
    });
    const b = node({
      text: "Photos",
      clickable: true,
      bounds: { x1: 0, y1: 100, x2: 100, y2: 150 },
      center: { x: 50, y: 125 },
    });
    const result = selectTapTarget([a, b], { by: "text", value: "Photos" });
    assert.ok(result);
    assert.equal(result.candidates_count, 2);
    // First in document order wins.
    assert.equal(result.tap_y, 25);
  });
});
