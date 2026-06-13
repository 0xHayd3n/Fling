import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleWaitForPair, __setOrchestratorForTest } from "../dist/tools/wait-for-pair.js";
import { clearPending, registerSessionForTest } from "../dist/tools/start-pair-qr.js";

describe("wait_for_pair", () => {
  it("rejects when service_name has no matching pending session", async () => {
    clearPending();
    const r = await handleWaitForPair({ service_name: "missing", timeout_ms: 500 });
    assert.equal(r.structuredContent.paired, false);
    assert.equal(r.structuredContent.error.code, "UNKNOWN_SERVICE");
  });

  it("returns paired:true when orchestrator succeeds", async () => {
    clearPending();
    registerSessionForTest("svc-ok", "pw", Date.now() + 60_000);
    __setOrchestratorForTest(async () => ({ kind: "success", serial: "10.0.0.5:55", model: "Pixel_7" }));
    const r = await handleWaitForPair({ service_name: "svc-ok", timeout_ms: 5000 });
    assert.equal(r.structuredContent.paired, true);
    assert.equal(r.structuredContent.serial, "10.0.0.5:55");
    assert.equal(r.structuredContent.model, "Pixel_7");
    __setOrchestratorForTest(null);
  });

  it("returns PAIRING_TIMEOUT when orchestrator times out", async () => {
    clearPending();
    registerSessionForTest("svc-to", "pw", Date.now() + 60_000);
    __setOrchestratorForTest(async () => ({ kind: "timeout" }));
    const r = await handleWaitForPair({ service_name: "svc-to", timeout_ms: 500 });
    assert.equal(r.structuredContent.paired, false);
    assert.equal(r.structuredContent.error.code, "PAIRING_TIMEOUT");
    __setOrchestratorForTest(null);
  });

  it("returns ADB_PAIR_FAILED on orchestrator error", async () => {
    clearPending();
    registerSessionForTest("svc-err", "pw", Date.now() + 60_000);
    __setOrchestratorForTest(async () => ({ kind: "error", reason: "Wrong password" }));
    const r = await handleWaitForPair({ service_name: "svc-err", timeout_ms: 500 });
    assert.equal(r.structuredContent.paired, false);
    assert.equal(r.structuredContent.error.code, "ADB_PAIR_FAILED");
    assert.match(r.structuredContent.error.message, /Wrong password/);
    __setOrchestratorForTest(null);
  });
});
