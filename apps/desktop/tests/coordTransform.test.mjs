import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeLetterbox, canvasToDevice, canvasToDeviceClamped } from "../src/renderer/lib/coordTransform.ts";

describe("computeLetterbox", () => {
  it("portrait device in wider canvas: vertical bars left/right", () => {
    const lb = computeLetterbox(1000, 600, 1080, 1920);
    assert.equal(lb.renderedH, 600);
    assert.ok(lb.renderedW < 600);
    assert.ok(lb.offsetX > 0);
    assert.equal(lb.offsetY, 0);
  });

  it("landscape device in taller canvas: bars top/bottom", () => {
    const lb = computeLetterbox(600, 1000, 1920, 1080);
    assert.equal(lb.renderedW, 600);
    assert.ok(lb.renderedH < 600);
    assert.equal(lb.offsetX, 0);
    assert.ok(lb.offsetY > 0);
  });

  it("zero device dims → identity", () => {
    const lb = computeLetterbox(500, 400, 0, 0);
    assert.equal(lb.renderedW, 500);
    assert.equal(lb.renderedH, 400);
  });
});

describe("canvasToDevice", () => {
  it("centre of canvas → centre of device", () => {
    const lb = { offsetX: 100, offsetY: 0, renderedW: 200, renderedH: 600 };
    const d = canvasToDevice(200, 300, lb, 1080, 1920);
    assert.ok(d);
    assert.equal(d.x, 540);
    assert.ok(Math.abs(d.y - 960) <= 1);
  });

  it("outside the letterbox returns null", () => {
    const lb = { offsetX: 100, offsetY: 0, renderedW: 200, renderedH: 600 };
    assert.equal(canvasToDevice(50, 300, lb, 1080, 1920), null);
  });
});

describe("canvasToDeviceClamped", () => {
  const lb = { offsetX: 100, offsetY: 50, renderedW: 200, renderedH: 600 };

  it("inside the letterbox matches canvasToDevice", () => {
    const inside = canvasToDevice(200, 350, lb, 1080, 1920);
    const clamped = canvasToDeviceClamped(200, 350, lb, 1080, 1920);
    assert.ok(inside);
    assert.equal(clamped.x, inside.x);
    assert.equal(clamped.y, inside.y);
  });

  it("left/above is clamped to the top-left", () => {
    const c = canvasToDeviceClamped(0, 0, lb, 1080, 1920);
    assert.equal(c.x, 0);
    assert.equal(c.y, 0);
  });

  it("right/below is clamped to the bottom-right", () => {
    const c = canvasToDeviceClamped(10000, 10000, lb, 1080, 1920);
    // Last pixel inside the rendered area maps just inside the device's bottom-right.
    assert.ok(c.x >= 1070 && c.x < 1080, `x=${c.x} out of range`);
    assert.ok(c.y >= 1910 && c.y < 1920, `y=${c.y} out of range`);
  });
});
