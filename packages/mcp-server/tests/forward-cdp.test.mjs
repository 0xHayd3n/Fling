import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateForwardCdpInputs } from "../dist/tools/forward-cdp.js";

describe("validateForwardCdpInputs", () => {
  it("requires package_name when prefer is webview", () => {
    assert.throws(
      () => validateForwardCdpInputs({ prefer: "webview", packageNameFromConfig: undefined }),
      /package_name/i
    );
  });

  it("requires package_name when prefer is any", () => {
    assert.throws(
      () => validateForwardCdpInputs({ prefer: "any", packageNameFromConfig: undefined }),
      /package_name/i
    );
  });

  it("does NOT require package_name when prefer is chrome", () => {
    const out = validateForwardCdpInputs({ prefer: "chrome", packageNameFromConfig: undefined });
    assert.equal(out.packageName, undefined);
  });

  it("falls back to config.packageName when package_name argument is absent", () => {
    const out = validateForwardCdpInputs({
      prefer: "webview",
      packageNameFromConfig: "com.example.app",
    });
    assert.equal(out.packageName, "com.example.app");
  });

  it("rejects out-of-range local_port", () => {
    assert.throws(
      () => validateForwardCdpInputs({ prefer: "chrome", localPort: 80 }),
      /local_port/i
    );
    assert.throws(
      () => validateForwardCdpInputs({ prefer: "chrome", localPort: 70000 }),
      /local_port/i
    );
  });

  it("accepts a valid local_port in [1024, 65535]", () => {
    const out = validateForwardCdpInputs({ prefer: "chrome", localPort: 9223 });
    assert.equal(out.localPort, 9223);
  });

  it("rejects an invalid package_name", () => {
    assert.throws(
      () => validateForwardCdpInputs({ prefer: "webview", packageName: "not-a-package" }),
      /package/i
    );
  });
});
