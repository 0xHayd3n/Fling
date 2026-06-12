import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { panelToAction } from "../dist/tools/open-setting.js";

describe("panelToAction", () => {
  it("maps friendly names to android.settings.* actions", () => {
    assert.equal(panelToAction("wifi"), "android.settings.WIFI_SETTINGS");
    assert.equal(panelToAction("bluetooth"), "android.settings.BLUETOOTH_SETTINGS");
    assert.equal(panelToAction("apps"), "android.settings.APPLICATION_SETTINGS");
    assert.equal(panelToAction("display"), "android.settings.DISPLAY_SETTINGS");
    assert.equal(panelToAction("about"), "android.settings.DEVICE_INFO_SETTINGS");
  });

  it("rejects unknown panel names with INVALID_INPUT", () => {
    assert.throws(
      () => panelToAction("garbage"),
      (err) => err.code === "INVALID_INPUT"
    );
  });

  it("covers a sensible set of common panels", () => {
    const required = [
      "wifi",
      "bluetooth",
      "apps",
      "display",
      "sound",
      "battery",
      "storage",
      "location",
      "security",
      "developer",
      "about",
      "date",
      "language",
      "accessibility",
      "notifications",
    ];
    for (const p of required) {
      assert.ok(
        panelToAction(p).startsWith("android.settings."),
        `panel "${p}" should map`
      );
    }
  });
});
