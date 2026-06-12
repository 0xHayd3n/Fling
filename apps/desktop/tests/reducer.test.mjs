import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { reducer } from "../src/renderer/state/reducer.ts";
import { INITIAL_STATE } from "../src/renderer/state/types.ts";

describe("reducer", () => {
  it("DEVICES_CHANGED replaces the device list", () => {
    const next = reducer(INITIAL_STATE, {
      type: "DEVICES_CHANGED",
      devices: [{ serial: "abc", state: "device", raw: "" }],
    });
    assert.equal(next.devices.length, 1);
    assert.equal(next.devices[0].serial, "abc");
  });

  it("MIRROR_STARTING then MIRROR_STARTED transitions status", () => {
    const starting = reducer(INITIAL_STATE, { type: "MIRROR_STARTING", deviceId: "dev1" });
    assert.equal(starting.mirror.status, "starting");
    const started = reducer(starting, {
      type: "MIRROR_STARTED",
      deviceId: "dev1",
      res: { mirrorId: "m1", width: 1080, height: 1920 },
    });
    assert.equal(started.mirror.status, "running");
    assert.equal(started.mirror.mirrorId, "m1");
  });

  it("TOAST_ADD caps the stack at 3", () => {
    let s = INITIAL_STATE;
    for (let i = 0; i < 5; i++) {
      s = reducer(s, { type: "TOAST_ADD", toast: { id: `t${i}`, kind: "info", message: `msg ${i}` } });
    }
    assert.equal(s.toasts.length, 3);
    assert.deepEqual(s.toasts.map((t) => t.id), ["t2", "t3", "t4"]);
  });

  it("TOAST_UPDATE patches only the matching id", () => {
    const s = reducer(INITIAL_STATE, { type: "TOAST_ADD", toast: { id: "a", kind: "progress", message: "x" } });
    const next = reducer(s, { type: "TOAST_UPDATE", id: "a", patch: { kind: "success", message: "y" } });
    assert.equal(next.toasts[0].kind, "success");
    assert.equal(next.toasts[0].message, "y");
  });

  it("DEPLOY_DONE resets deploy slice to idle", () => {
    const started = reducer(INITIAL_STATE, {
      type: "DEPLOY_STARTED",
      evt: { runId: "r1" },
      toastId: "t1",
    });
    const done = reducer(started, {
      type: "DEPLOY_DONE",
      evt: { runId: "r1", success: true, finalMessage: "ok", durationMs: 1000 },
    });
    assert.equal(done.deploy.status, "idle");
    assert.equal(done.deploy.runId, null);
  });
});
