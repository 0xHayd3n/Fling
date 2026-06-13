import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { encodeTouch } from "../src/renderer/lib/scrcpyControl.ts";

describe("encodeTouch", () => {
  it("encodes a down event with correct layout", () => {
    const buf = encodeTouch("down", 100, 200, 1, 1080, 1920);
    assert.equal(buf.length, 28);
    assert.equal(buf[0], 2);
    assert.equal(buf[1], 0);
    assert.equal(buf[9], 1);
    const view = new DataView(buf.buffer);
    assert.equal(view.getInt32(10, false), 100);
    assert.equal(view.getInt32(14, false), 200);
    assert.equal(view.getUint16(18, false), 1080);
    assert.equal(view.getUint16(20, false), 1920);
    assert.equal(view.getUint16(22, false), 0xffff);
  });

  it("encodes an up event with zero pressure", () => {
    const buf = encodeTouch("up", 0, 0, 1, 1080, 1920);
    assert.equal(buf[1], 1);
    const view = new DataView(buf.buffer);
    assert.equal(view.getUint16(22, false), 0);
  });
});
