import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseDeviceState } from "../dist/tools/device-state.js";

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
});
