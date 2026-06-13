import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canvasToDevice, canvasToDeviceClamped } from "../src/renderer/lib/coordTransform.ts";

describe("canvasToDevice", () => {
  it("centre maps to centre", () => {
    const d = canvasToDevice(100, 200, 200, 400, 1080, 2400);
    assert.ok(d);
    assert.equal(d.x, 540);
    assert.equal(d.y, 1200);
  });
  it("top-left maps to (0, 0)", () => {
    const d = canvasToDevice(0, 0, 200, 400, 1080, 2400);
    assert.ok(d);
    assert.equal(d.x, 0);
    assert.equal(d.y, 0);
  });
  it("outside the rect returns null", () => {
    assert.equal(canvasToDevice(-1, 100, 200, 400, 1080, 2400), null);
    assert.equal(canvasToDevice(100, -1, 200, 400, 1080, 2400), null);
    assert.equal(canvasToDevice(200, 100, 200, 400, 1080, 2400), null);
    assert.equal(canvasToDevice(100, 400, 200, 400, 1080, 2400), null);
  });
});

describe("canvasToDeviceClamped", () => {
  it("inside the rect matches canvasToDevice", () => {
    const inside = canvasToDevice(50, 100, 200, 400, 1080, 2400);
    const clamped = canvasToDeviceClamped(50, 100, 200, 400, 1080, 2400);
    assert.ok(inside);
    assert.equal(clamped.x, inside.x);
    assert.equal(clamped.y, inside.y);
  });
  it("above/left clamps to (0, 0)", () => {
    const c = canvasToDeviceClamped(-100, -100, 200, 400, 1080, 2400);
    assert.equal(c.x, 0);
    assert.equal(c.y, 0);
  });
  it("below/right clamps to inside the bottom-right", () => {
    const c = canvasToDeviceClamped(10000, 10000, 200, 400, 1080, 2400);
    assert.ok(c.x >= 1070 && c.x < 1080, `x=${c.x}`);
    assert.ok(c.y >= 2390 && c.y < 2400, `y=${c.y}`);
  });
});
