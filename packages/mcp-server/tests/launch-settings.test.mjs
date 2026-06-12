import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSettingsAction,
  validateSettingsDataUri,
  buildSettingsAmArgs,
  interpretSettingsResult,
  SETTINGS_ACTION_ALLOWLIST,
} from "../dist/tools/launch-settings.js";

describe("normalizeSettingsAction", () => {
  it("accepts a bare suffix and returns the fully qualified action", () => {
    assert.equal(
      normalizeSettingsAction("WIFI_SETTINGS"),
      "android.settings.WIFI_SETTINGS"
    );
  });

  it("accepts a fully qualified action and returns it unchanged", () => {
    assert.equal(
      normalizeSettingsAction("android.settings.BLUETOOTH_SETTINGS"),
      "android.settings.BLUETOOTH_SETTINGS"
    );
  });

  it("trims surrounding whitespace before validating", () => {
    assert.equal(
      normalizeSettingsAction("  WIFI_SETTINGS  "),
      "android.settings.WIFI_SETTINGS"
    );
  });

  it("rejects an unknown action with INVALID_INPUT", () => {
    assert.throws(
      () => normalizeSettingsAction("DEFINITELY_NOT_A_REAL_SETTING"),
      (err) => err.code === "INVALID_INPUT"
    );
  });

  it("rejects an action with the wrong prefix", () => {
    assert.throws(
      () => normalizeSettingsAction("android.intent.action.VIEW"),
      (err) => err.code === "INVALID_INPUT"
    );
  });

  it("rejects characters outside the allowlist character set", () => {
    assert.throws(
      () => normalizeSettingsAction("WIFI_SETTINGS; rm -rf /"),
      (err) => err.code === "INVALID_INPUT"
    );
  });

  it("rejects empty input", () => {
    assert.throws(
      () => normalizeSettingsAction(""),
      (err) => err.code === "INVALID_INPUT"
    );
  });

  it("exposes a non-empty allowlist of standard android.settings.* actions", () => {
    assert.ok(SETTINGS_ACTION_ALLOWLIST.size >= 20);
    assert.ok(SETTINGS_ACTION_ALLOWLIST.has("WIFI_SETTINGS"));
    assert.ok(SETTINGS_ACTION_ALLOWLIST.has("APPLICATION_DETAILS_SETTINGS"));
    assert.ok(SETTINGS_ACTION_ALLOWLIST.has("BLUETOOTH_SETTINGS"));
    assert.ok(SETTINGS_ACTION_ALLOWLIST.has("DISPLAY_SETTINGS"));
  });
});

describe("validateSettingsDataUri", () => {
  it("accepts a well-formed package URI", () => {
    assert.doesNotThrow(() => validateSettingsDataUri("package:com.example.app"));
    assert.doesNotThrow(() => validateSettingsDataUri("package:com.android.settings"));
  });

  it("rejects URIs without the package: scheme", () => {
    assert.throws(
      () => validateSettingsDataUri("https://example.com"),
      (err) => err.code === "INVALID_INPUT"
    );
    assert.throws(
      () => validateSettingsDataUri("com.example.app"),
      (err) => err.code === "INVALID_INPUT"
    );
  });

  it("rejects a package URI whose payload is not a dotted Android id", () => {
    assert.throws(
      () => validateSettingsDataUri("package:not-a-package"),
      (err) => err.code === "INVALID_INPUT"
    );
    assert.throws(
      () => validateSettingsDataUri("package:single"),
      (err) => err.code === "INVALID_INPUT"
    );
  });

  it("rejects shell-metacharacter injection attempts", () => {
    assert.throws(
      () => validateSettingsDataUri("package:com.foo;rm -rf /"),
      (err) => err.code === "INVALID_INPUT"
    );
  });

  it("rejects an empty URI", () => {
    assert.throws(
      () => validateSettingsDataUri(""),
      (err) => err.code === "INVALID_INPUT"
    );
  });
});

describe("buildSettingsAmArgs", () => {
  it("builds the minimal argv when only action is provided (includes -W for success detection)", () => {
    const argv = buildSettingsAmArgs({
      action: "android.settings.WIFI_SETTINGS",
      deviceArgs: ["-s", "emulator-5554"],
    });
    assert.deepEqual(argv, [
      "-s",
      "emulator-5554",
      "shell",
      "am",
      "start",
      "-W",
      "-a",
      "android.settings.WIFI_SETTINGS",
    ]);
  });

  it("appends -d <data_uri> when supplied", () => {
    const argv = buildSettingsAmArgs({
      action: "android.settings.APPLICATION_DETAILS_SETTINGS",
      dataUri: "package:com.example.app",
      deviceArgs: ["-s", "RFCN12345"],
    });
    assert.deepEqual(argv, [
      "-s",
      "RFCN12345",
      "shell",
      "am",
      "start",
      "-W",
      "-a",
      "android.settings.APPLICATION_DETAILS_SETTINGS",
      "-d",
      "package:com.example.app",
    ]);
  });

  it("places device args before the shell sub-command", () => {
    const argv = buildSettingsAmArgs({
      action: "android.settings.NETWORK_OPERATOR_SETTINGS",
      deviceArgs: ["-s", "abc123"],
    });
    assert.equal(argv[0], "-s");
    assert.equal(argv[1], "abc123");
    assert.equal(argv[2], "shell");
  });
});

describe("interpretSettingsResult", () => {
  it("treats 'Status: ok' as success", () => {
    const r = interpretSettingsResult(
      "Starting: Intent { act=android.settings.WIFI_SETTINGS }\nStatus: ok\nActivity: com.android.settings/.Settings$WifiSettingsActivity",
      ""
    );
    assert.equal(r.success, true);
  });

  it("treats 'Error: Activity not started' as failure", () => {
    const r = interpretSettingsResult(
      "Starting: Intent { act=android.settings.WIFI_SETTINGS }",
      "Error: Activity not started, unable to resolve Intent"
    );
    assert.equal(r.success, false);
    assert.match(r.raw, /Activity not started/);
  });

  it("treats SecurityException as failure", () => {
    const r = interpretSettingsResult(
      "",
      "java.lang.SecurityException: Permission Denial"
    );
    assert.equal(r.success, false);
  });

  it("treats output without 'Status: ok' as failure", () => {
    const r = interpretSettingsResult("Starting: Intent { ... }", "");
    assert.equal(r.success, false);
  });
});
