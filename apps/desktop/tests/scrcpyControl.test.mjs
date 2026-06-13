import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { encodeTouch } from "../src/renderer/lib/scrcpyControl.ts";

describe("encodeTouch", () => {
  it("encodes a down event with the full 32-byte scrcpy 2.7 layout", () => {
    const buf = encodeTouch("down", 100, 200, 1, 1080, 1920);
    assert.equal(buf.length, 32);
    assert.equal(buf[0], 2);  // type TOUCH
    assert.equal(buf[1], 0);  // action DOWN
    assert.equal(buf[9], 1);  // pointerId u64 LSB
    const view = new DataView(buf.buffer);
    assert.equal(view.getInt32(10, false), 100);  // x
    assert.equal(view.getInt32(14, false), 200);  // y
    assert.equal(view.getUint16(18, false), 1080);// screenW
    assert.equal(view.getUint16(20, false), 1920);// screenH
    assert.equal(view.getUint16(22, false), 0xffff); // pressure
    assert.equal(view.getInt32(24, false), 0);    // actionButton
    assert.equal(view.getInt32(28, false), 0);    // buttons
  });

  it("encodes an up event with zero pressure", () => {
    const buf = encodeTouch("up", 0, 0, 1, 1080, 1920);
    assert.equal(buf.length, 32);
    assert.equal(buf[1], 1);
    const view = new DataView(buf.buffer);
    assert.equal(view.getUint16(22, false), 0);
  });
});
