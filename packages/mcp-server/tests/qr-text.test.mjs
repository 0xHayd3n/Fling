import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildQrText } from "../dist/qrText.js";

describe("buildQrText", () => {
  it("builds the standard Android wireless-debugging QR payload", () => {
    const out = buildQrText({ serviceName: "fling-debug-7f3a", password: "abc123" });
    assert.equal(out, "WIFI:T:ADB;S:fling-debug-7f3a;P:abc123;;");
  });

  it("does not escape password characters", () => {
    const out = buildQrText({ serviceName: "svc", password: "a+/=b" });
    assert.equal(out, "WIFI:T:ADB;S:svc;P:a+/=b;;");
  });

  it("throws when serviceName is empty", () => {
    assert.throws(() => buildQrText({ serviceName: "", password: "p" }));
  });

  it("throws when password is empty", () => {
    assert.throws(() => buildQrText({ serviceName: "s", password: "" }));
  });
});
