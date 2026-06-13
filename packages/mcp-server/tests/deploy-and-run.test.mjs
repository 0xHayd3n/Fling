import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildCdpFieldFromOutcome } from "../dist/tools/deploy-and-run.js";
import { FlingError } from "../dist/errors.js";

describe("buildCdpFieldFromOutcome", () => {
  it("returns success-shape when expose succeeded", () => {
    const result = {
      cdp_url: "http://127.0.0.1:9223",
      ws_url: "ws://127.0.0.1:9223/devtools/page/A",
      target: { type: "webview", title: "My App", pid: 12345 },
      local_port: 9223,
      socket_name: "webview_devtools_remote_12345",
      device_id: "emulator-5554",
    };
    assert.deepEqual(buildCdpFieldFromOutcome({ ok: true, value: result }), {
      success: true,
      ...result,
    });
  });

  it("returns failure-shape when expose threw a FlingError", () => {
    const err = new FlingError("CDP_WEBVIEW_NOT_DEBUGGABLE", "Add setWebContentsDebuggingEnabled");
    assert.deepEqual(buildCdpFieldFromOutcome({ ok: false, error: err }), {
      success: false,
      error_code: "CDP_WEBVIEW_NOT_DEBUGGABLE",
      message: "Add setWebContentsDebuggingEnabled",
    });
  });

  it("returns failure-shape with UNKNOWN code for non-FlingError throws", () => {
    const out = buildCdpFieldFromOutcome({ ok: false, error: new Error("network is down") });
    assert.equal(out.success, false);
    assert.equal(out.error_code, "UNKNOWN");
    assert.match(out.message, /network is down/);
  });
});
