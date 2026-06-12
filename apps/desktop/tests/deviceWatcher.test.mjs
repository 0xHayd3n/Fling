import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { devicesEqual, createDeviceWatcher } from "../src/main/deviceWatcher.ts";

describe("devicesEqual", () => {
  it("ignores order", () => {
    assert.ok(devicesEqual(
      [{ serial: "a", state: "device", raw: "" }, { serial: "b", state: "device", raw: "" }],
      [{ serial: "b", state: "device", raw: "" }, { serial: "a", state: "device", raw: "" }],
    ));
  });
  it("detects state change", () => {
    assert.ok(!devicesEqual(
      [{ serial: "a", state: "unauthorized", raw: "" }],
      [{ serial: "a", state: "device", raw: "" }],
    ));
  });
  it("detects new device", () => {
    assert.ok(!devicesEqual(
      [{ serial: "a", state: "device", raw: "" }],
      [{ serial: "a", state: "device", raw: "" }, { serial: "b", state: "device", raw: "" }],
    ));
  });
});

describe("createDeviceWatcher", () => {
  it("emits 'changed' only when the snapshot changes", async () => {
    const responses = [
      [],
      [{ serial: "a", state: "device", raw: "" }],
      [{ serial: "a", state: "device", raw: "" }],
      [{ serial: "a", state: "unauthorized", raw: "" }],
    ];
    const changes = [];
    let last = [];
    const w = createDeviceWatcher({
      pollMs: 5,
      listFn: async () => {
        if (responses.length) last = responses.shift();
        return last;
      },
    });
    w.on("changed", (d) => changes.push(d.length === 0 ? "empty" : `${d[0].serial}:${d[0].state}`));
    w.start();
    await new Promise((r) => setTimeout(r, 80));
    w.stop();
    assert.deepEqual(changes, ["a:device", "a:unauthorized"]);
  });
});
