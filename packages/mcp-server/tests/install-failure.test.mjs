import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractInstallFailure } from "../dist/tools/install-app.js";

describe("extractInstallFailure", () => {
  it("returns the code from the legacy 'Failure [CODE]' format", () => {
    const stderr =
      "adb: failed to install foo.apk: Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE: Package signatures do not match]";
    const result = extractInstallFailure("", stderr);
    assert.equal(result.code, "INSTALL_FAILED_UPDATE_INCOMPATIBLE");
    assert.match(result.raw, /Failure/);
  });

  it("returns the code from the API 30+ multi-line format", () => {
    const stderr = [
      "adb: failed to install foo.apk: Exception occurred while executing 'install':",
      "android.content.pm.PackageManager$NameNotFoundException: INSTALL_FAILED_UPDATE_INCOMPATIBLE",
      "        at com.android.server.pm.PackageManagerService...",
    ].join("\n");
    const result = extractInstallFailure("", stderr);
    assert.equal(result.code, "INSTALL_FAILED_UPDATE_INCOMPATIBLE");
    assert.match(result.raw, /adb: failed to install/);
  });

  it("captures up to three context lines from the marker", () => {
    const stderr = [
      "Performing Streamed Install",
      "adb: failed to install foo.apk: Exception:",
      "INSTALL_FAILED_INSUFFICIENT_STORAGE",
      "    at ...",
      "    at ...",
    ].join("\n");
    const result = extractInstallFailure("", stderr);
    assert.equal(result.code, "INSTALL_FAILED_INSUFFICIENT_STORAGE");
    const lines = result.raw.split("\n");
    assert.equal(lines.length, 3);
    assert.match(lines[0], /^adb: failed to install/);
  });

  it("handles INSTALL_PARSE_FAILED_* codes", () => {
    const stderr =
      "Failure [INSTALL_PARSE_FAILED_NO_CERTIFICATES: No signature found in package]";
    const result = extractInstallFailure("", stderr);
    assert.equal(result.code, "INSTALL_PARSE_FAILED_NO_CERTIFICATES");
  });

  it("returns undefined code when no recognisable marker exists", () => {
    const stderr = "something broke and the message is opaque";
    const result = extractInstallFailure("", stderr);
    assert.equal(result.code, undefined);
    assert.match(result.raw, /opaque/);
  });

  it("trims surrounding whitespace", () => {
    const stderr = "\n\n  adb: failed to install foo.apk\n  INSTALL_FAILED_OLDER_SDK\n\n";
    const result = extractInstallFailure("", stderr);
    assert.equal(result.code, "INSTALL_FAILED_OLDER_SDK");
    assert.ok(!result.raw.startsWith(" "));
    assert.ok(!result.raw.endsWith("\n"));
  });
});
