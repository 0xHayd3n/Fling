import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseDeviceState, buildDeviceStateCommand } from "../dist/tools/device-state.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = (name) => join(__dirname, "fixtures", name);

describe("parseDeviceState", () => {
  it("splits sections by ##MARKER lines and extracts each field", () => {
    const stdout = [
      "##FOREGROUND",
      "  mResumedActivity: ActivityRecord{abcd1234 u0 com.example.app/.MainActivity t42}",
      "##SCREEN",
      "  mWakefulness=Awake",
      "  Display Power: state=ON",
      "##ORIENTATION",
      "  SurfaceOrientation: 0",
      "##LOGCAT",
      "06-13 01:00:00.000 1 1 I tag : hello",
      "06-13 01:00:00.001 1 1 I tag : world",
    ].join("\n");

    const state = parseDeviceState(stdout);
    assert.equal(state.foreground_package, "com.example.app");
    assert.equal(state.foreground_activity, "com.example.app/.MainActivity");
    assert.equal(state.screen_on, true);
    assert.equal(state.orientation, 0);
    assert.equal(state.logcat_tail.length, 2);
    assert.match(state.logcat_tail[0], /hello/);
  });

  it("returns nulls when sections are empty", () => {
    const stdout = "##FOREGROUND\n##SCREEN\n##ORIENTATION\n##LOGCAT\n";
    const state = parseDeviceState(stdout);
    assert.equal(state.foreground_package, null);
    assert.equal(state.foreground_activity, null);
    assert.equal(state.screen_on, null);
    assert.equal(state.orientation, null);
    assert.deepEqual(state.logcat_tail, []);
  });

  it("treats Display Power: state=OFF as screen_on=false", () => {
    const stdout = [
      "##FOREGROUND",
      "##SCREEN",
      "Display Power: state=OFF",
      "##ORIENTATION",
      "##LOGCAT",
    ].join("\n");
    const state = parseDeviceState(stdout);
    assert.equal(state.screen_on, false);
  });

  it("handles \\r\\n line endings", () => {
    const stdout =
      "##FOREGROUND\r\n##SCREEN\r\nDisplay Power: state=ON\r\n##ORIENTATION\r\nSurfaceOrientation: 1\r\n##LOGCAT\r\n";
    const state = parseDeviceState(stdout);
    assert.equal(state.screen_on, true);
    assert.equal(state.orientation, 1);
  });

  it("doesn't crash if a section is missing entirely", () => {
    const stdout = "##FOREGROUND\n##LOGCAT\nline\n";
    const state = parseDeviceState(stdout);
    assert.equal(state.screen_on, null);
    assert.equal(state.orientation, null);
    assert.equal(state.logcat_tail.length, 1);
  });

  it("parses real captured dumpsys output from a modern Android device", () => {
    const stdout = readFileSync(
      fixturePath("device-state-android-motorola.txt"),
      "utf8"
    );
    const state = parseDeviceState(stdout);
    assert.equal(state.foreground_package, "com.android.settings");
    assert.equal(state.foreground_activity, "com.android.settings/.Settings");
    assert.equal(state.screen_on, true);
    assert.equal(state.orientation, 0);
    assert.ok(state.logcat_tail.length >= 1);
  });

  it("parses topResumedActivity (modern AOSP field name)", () => {
    const stdout = [
      "##FOREGROUND",
      "    topResumedActivity=ActivityRecord{abc u0 com.example.app/.MainActivity t99}",
      "##SCREEN",
      "##ORIENTATION",
      "##LOGCAT",
    ].join("\n");
    const state = parseDeviceState(stdout);
    assert.equal(state.foreground_package, "com.example.app");
  });

  it("parses mFocusedApp as a foreground fallback", () => {
    const stdout = [
      "##FOREGROUND",
      "  mFocusedApp=ActivityRecord{abc u0 com.example.app/.MainActivity t99}",
      "##SCREEN",
      "##ORIENTATION",
      "##LOGCAT",
    ].join("\n");
    const state = parseDeviceState(stdout);
    assert.equal(state.foreground_package, "com.example.app");
  });

  it("treats mWakefulness=Awake as screen_on=true", () => {
    const stdout = [
      "##FOREGROUND",
      "##SCREEN",
      "  mWakefulness=Awake",
      "  Display Power: com.android.server.power.PowerManagerService$2@deadbeef",
      "##ORIENTATION",
      "##LOGCAT",
    ].join("\n");
    const state = parseDeviceState(stdout);
    assert.equal(state.screen_on, true);
  });

  it("treats mWakefulness=Asleep as screen_on=false", () => {
    const stdout = "##FOREGROUND\n##SCREEN\n  mWakefulness=Asleep\n##ORIENTATION\n##LOGCAT\n";
    const state = parseDeviceState(stdout);
    assert.equal(state.screen_on, false);
  });

  it("treats mWakefulness=Dozing as screen_on=false", () => {
    const stdout = "##FOREGROUND\n##SCREEN\n  mWakefulness=Dozing\n##ORIENTATION\n##LOGCAT\n";
    const state = parseDeviceState(stdout);
    assert.equal(state.screen_on, false);
  });

  it("parses mCurrentOrientation as the orientation field", () => {
    const stdout = "##FOREGROUND\n##SCREEN\n##ORIENTATION\n    mCurrentOrientation=3\n##LOGCAT\n";
    const state = parseDeviceState(stdout);
    assert.equal(state.orientation, 3);
  });
});

describe("buildDeviceStateCommand", () => {
  it("uses modern foreground field names that work on AOSP >= 13", () => {
    const cmd = buildDeviceStateCommand();
    assert.match(cmd, /ResumedActivity/);
    assert.match(cmd, /mFocusedApp/);
  });

  it("sources orientation from dumpsys display, not dumpsys input", () => {
    const cmd = buildDeviceStateCommand();
    assert.match(cmd, /dumpsys display \| grep .*mCurrentOrientation/);
    assert.doesNotMatch(cmd, /dumpsys input \| grep SurfaceOrientation/);
  });

  it("single-quotes the ##MARKER section headers so the device shell doesn't treat # as a comment", () => {
    const cmd = buildDeviceStateCommand();
    for (const marker of ["FOREGROUND", "SCREEN", "ORIENTATION", "LOGCAT"]) {
      assert.match(cmd, new RegExp(`echo '##${marker}'`));
    }
    assert.doesNotMatch(cmd, /echo ##\w/);
  });
});
