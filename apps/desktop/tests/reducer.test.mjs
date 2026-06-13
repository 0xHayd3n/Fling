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

  it("MIRROR_STOPPING transitions running → stopping", () => {
    const running = reducer(INITIAL_STATE, { type: "MIRROR_STARTING", deviceId: "d" });
    const started = reducer(running, {
      type: "MIRROR_STARTED",
      deviceId: "d",
      res: { mirrorId: "m1", width: 1, height: 1, configNal: new ArrayBuffer(0), firstKeyNal: new ArrayBuffer(0), firstKeyPts: 0 },
    });
    const stopping = reducer(started, { type: "MIRROR_STOPPING" });
    assert.equal(stopping.mirror.status, "stopping");
    assert.equal(stopping.mirror.mirrorId, "m1", "mirrorId preserved so stop IPC can target it");
  });

  it("MIRROR_ENDED with reason transitions to error status with reason", () => {
    const running = reducer(INITIAL_STATE, { type: "MIRROR_STARTING", deviceId: "d" });
    const started = reducer(running, {
      type: "MIRROR_STARTED",
      deviceId: "d",
      res: { mirrorId: "m1", width: 1, height: 1, configNal: new ArrayBuffer(0), firstKeyNal: new ArrayBuffer(0), firstKeyPts: 0 },
    });
    const ended = reducer(started, { type: "MIRROR_ENDED", evt: { mirrorId: "m1", reason: "video-socket-closed" } });
    assert.equal(ended.mirror.status, "error");
    assert.equal(ended.mirror.errorReason, "video-socket-closed");
  });

  it("MIRROR_STOPPED clears status and errorReason from error state", () => {
    const errored = {
      ...INITIAL_STATE,
      mirror: { ...INITIAL_STATE.mirror, status: "error", errorReason: "test", mirrorId: "m1" },
    };
    const off = reducer(errored, { type: "MIRROR_STOPPED" });
    assert.equal(off.mirror.status, "off");
    assert.equal(off.mirror.errorReason, null);
    assert.equal(off.mirror.mirrorId, null);
  });

  it("MIRROR_RESIZED is ignored when status is starting", () => {
    const starting = reducer(INITIAL_STATE, { type: "MIRROR_STARTING", deviceId: "d" });
    const same = reducer(starting, { type: "MIRROR_RESIZED", evt: { mirrorId: "m1", width: 999, height: 999 } });
    assert.equal(same.mirror.width, 0, "resize should not mutate non-running state");
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

  it("WINDOW_SET_PIN updates only state.window.isPinned", () => {
    const next = reducer(INITIAL_STATE, { type: "WINDOW_SET_PIN", pinned: true });
    assert.equal(next.window.isPinned, true);
    assert.equal(next.window.opacity, INITIAL_STATE.window.opacity, "opacity untouched");
  });

  it("WINDOW_SET_OPACITY clamps to [0.3, 1.0] inside the reducer", () => {
    const tooLow = reducer(INITIAL_STATE, { type: "WINDOW_SET_OPACITY", opacity: 0.1 });
    assert.equal(tooLow.window.opacity, 0.3);
    const tooHigh = reducer(INITIAL_STATE, { type: "WINDOW_SET_OPACITY", opacity: 99 });
    assert.equal(tooHigh.window.opacity, 1.0);
    const valid = reducer(INITIAL_STATE, { type: "WINDOW_SET_OPACITY", opacity: 0.55 });
    assert.equal(valid.window.opacity, 0.55);
  });
});
