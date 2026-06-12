import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tapAndVerify } from "../dist/tools/tap-text-verified.js";
import { node } from "./test-helpers.mjs";

describe("tapAndVerify", () => {
  it("returns tapped + verified when expect appears in re-dump", async () => {
    let dumps = 0;
    const dumpFn = async () => {
      dumps++;
      if (dumps === 1) {
        return [node({ text: "Bluetooth", clickable: true, center: { x: 100, y: 200 } })];
      }
      return [node({ text: "Pair new device" })];
    };
    const taps = [];
    const tapFn = async (x, y) => taps.push({ x, y });

    const result = await tapAndVerify({
      text: "Bluetooth",
      expect: "Pair new device",
      timeoutMs: 1000,
      pollIntervalMs: 10,
      dumpFn,
      tapFn,
      sleepFn: async () => {},
      nowFn: () => 0,
    });

    assert.equal(result.tapped, true);
    assert.equal(result.verified, true);
    assert.deepEqual(taps, [{ x: 100, y: 200 }]);
  });

  it("returns verified=false when expect never appears within timeout", async () => {
    const dumpFn = async () => [
      node({ text: "Bluetooth", clickable: true, center: { x: 1, y: 2 } }),
    ];
    let virtualMs = 0;
    const result = await tapAndVerify({
      text: "Bluetooth",
      expect: "Pair new device",
      timeoutMs: 30,
      pollIntervalMs: 10,
      dumpFn,
      tapFn: async () => {},
      sleepFn: async (ms) => { virtualMs += ms; },
      nowFn: () => virtualMs,
    });
    assert.equal(result.tapped, true);
    assert.equal(result.verified, false);
  });

  it("verifies via gone=Foo when Foo disappears after the tap", async () => {
    let dumps = 0;
    const dumpFn = async () => {
      dumps++;
      if (dumps === 1) return [node({ text: "Confirm", clickable: true, center: { x: 5, y: 5 } })];
      return [];
    };
    const result = await tapAndVerify({
      text: "Confirm",
      gone: "Confirm",
      timeoutMs: 1000,
      pollIntervalMs: 10,
      dumpFn,
      tapFn: async () => {},
      sleepFn: async () => {},
      nowFn: () => 0,
    });
    assert.equal(result.verified, true);
  });

  it("returns verified=true immediately when neither expect nor gone is set", async () => {
    const dumpFn = async () => [
      node({ text: "Anything", clickable: true, center: { x: 0, y: 0 } }),
    ];
    const result = await tapAndVerify({
      text: "Anything",
      dumpFn,
      tapFn: async () => {},
      sleepFn: async () => {},
      nowFn: () => 0,
    });
    assert.equal(result.tapped, true);
    assert.equal(result.verified, true);
  });

  it("throws UI_ELEMENT_NOT_FOUND when target text is missing", async () => {
    const dumpFn = async () => [node({ text: "Other" })];
    await assert.rejects(
      () => tapAndVerify({
        text: "Bluetooth",
        dumpFn,
        tapFn: async () => {},
        sleepFn: async () => {},
        nowFn: () => 0,
      }),
      (err) => err.code === "UI_ELEMENT_NOT_FOUND"
    );
  });
});
