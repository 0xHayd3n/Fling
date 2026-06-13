import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createNalSplitter, decodeDeviceMeta } from "../src/main/scrcpyNalParser.ts";

function framePacket(pts, nalBytes, flags = 0n) {
  const buf = new Uint8Array(12 + nalBytes.length);
  const view = new DataView(buf.buffer);
  view.setBigUint64(0, (BigInt(pts) & 0x3fffffffffffffffn) | flags, false);
  view.setUint32(8, nalBytes.length, false);
  buf.set(nalBytes, 12);
  return buf;
}
const FLAG_CONFIG = 0x8000000000000000n;
const FLAG_KEY = 0x4000000000000000n;

describe("createNalSplitter", () => {
  it("returns a single frame when one full packet arrives", () => {
    const split = createNalSplitter();
    const frames = split.push(framePacket(1000, new Uint8Array([1, 2, 3, 4])));
    assert.equal(frames.length, 1);
    assert.equal(frames[0].pts, 1000);
    assert.equal(frames[0].isConfig, false);
    assert.equal(frames[0].isKey, false);
    assert.deepEqual(Array.from(frames[0].nal), [1, 2, 3, 4]);
    assert.equal(split.pending(), 0);
  });

  it("strips CONFIG and KEY flags from PTS", () => {
    const split = createNalSplitter();
    const cfg = split.push(framePacket(0, new Uint8Array([0xaa]), FLAG_CONFIG));
    assert.equal(cfg[0].isConfig, true);
    assert.equal(cfg[0].isKey, false);
    assert.equal(cfg[0].pts, 0);
    const key = split.push(framePacket(5000, new Uint8Array([0xbb]), FLAG_KEY));
    assert.equal(key[0].isKey, true);
    assert.equal(key[0].isConfig, false);
    assert.equal(key[0].pts, 5000);
  });

  it("holds back a partial frame across pushes", () => {
    const split = createNalSplitter();
    const full = framePacket(2000, new Uint8Array([9, 9, 9, 9, 9]));
    const part1 = full.slice(0, 10);
    const part2 = full.slice(10);
    assert.deepEqual(split.push(part1), []);
    assert.ok(split.pending() > 0);
    const frames = split.push(part2);
    assert.equal(frames.length, 1);
    assert.equal(frames[0].pts, 2000);
    assert.equal(split.pending(), 0);
  });

  it("splits multiple frames in one push", () => {
    const split = createNalSplitter();
    const a = framePacket(10, new Uint8Array([1]));
    const b = framePacket(20, new Uint8Array([2, 2]));
    const combined = new Uint8Array(a.length + b.length);
    combined.set(a, 0); combined.set(b, a.length);
    const frames = split.push(combined);
    assert.equal(frames.length, 2);
    assert.equal(frames[0].pts, 10);
    assert.equal(frames[1].pts, 20);
  });
});

describe("decodeDeviceMeta", () => {
  it("decodes name, skips codec_id, returns u32 BE width/height", () => {
    const packet = new Uint8Array(76);
    const name = new TextEncoder().encode("Pixel 7");
    packet.set(name, 0);
    // bytes 64..67 codec_id "h264"
    packet.set(new TextEncoder().encode("h264"), 64);
    // bytes 68..71 width 1080 u32 BE
    new DataView(packet.buffer).setUint32(68, 1080, false);
    // bytes 72..75 height 1920 u32 BE
    new DataView(packet.buffer).setUint32(72, 1920, false);
    const m = decodeDeviceMeta(packet);
    assert.equal(m.deviceName, "Pixel 7");
    assert.equal(m.width, 1080);
    assert.equal(m.height, 1920);
  });
});
