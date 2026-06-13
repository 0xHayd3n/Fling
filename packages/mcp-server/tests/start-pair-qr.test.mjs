import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { __pendingForTest, clearPending, registerSessionForTest } from "../dist/tools/start-pair-qr.js";

describe("start_pair_qr session store", () => {
  it("registers a service name and lets the caller retrieve it", () => {
    clearPending();
    registerSessionForTest("svc-x", "pw-y", Date.now() + 60_000);
    const m = __pendingForTest();
    assert.equal(m.get("svc-x")?.password, "pw-y");
  });

  it("expires entries past expiresAt on next read", () => {
    clearPending();
    registerSessionForTest("svc-z", "pw-z", Date.now() - 1000);
    const m = __pendingForTest();
    assert.equal(m.get("svc-z"), undefined);
  });
});
