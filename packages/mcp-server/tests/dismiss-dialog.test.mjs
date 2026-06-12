import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectDenyButton } from "../dist/tools/dismiss-dialog.js";

function node(overrides = {}) {
  return {
    text: "",
    content_desc: "",
    resource_id: "",
    class: "android.widget.Button",
    package: "com.example",
    bounds: { x1: 0, y1: 0, x2: 100, y2: 100 },
    center: { x: 50, y: 50 },
    clickable: true,
    long_clickable: false,
    scrollable: false,
    focusable: true,
    focused: false,
    enabled: true,
    selected: false,
    checkable: false,
    checked: false,
    ...overrides,
  };
}

describe("selectDenyButton", () => {
  it("returns null when no deny-label button is present", () => {
    const nodes = [node({ text: "Continue" }), node({ text: "OK" })];
    assert.equal(selectDenyButton(nodes), null);
  });

  it('finds "Don’t allow" (Android U+2019 apostrophe)', () => {
    const button = node({
      text: "Don’t allow",
      center: { x: 364, y: 2469 },
    });
    const result = selectDenyButton([button]);
    assert.ok(result);
    assert.equal(result.label, "Don’t allow");
    assert.equal(result.tap_x, 364);
    assert.equal(result.tap_y, 2469);
  });

  it("finds \"Don't allow\" with ASCII apostrophe too", () => {
    const button = node({ text: "Don't allow" });
    const result = selectDenyButton([button]);
    assert.ok(result);
    assert.equal(result.label, "Don't allow");
  });

  it("matches case-insensitively", () => {
    const button = node({ text: "DISMISS" });
    const result = selectDenyButton([button]);
    assert.ok(result);
    assert.equal(result.label, "DISMISS");
  });

  it("only considers clickable nodes", () => {
    const labelOnly = node({
      text: "Cancel",
      clickable: false,
      class: "android.widget.TextView",
    });
    assert.equal(selectDenyButton([labelOnly]), null);
  });

  it("skips clickable-but-disabled deny buttons", () => {
    const disabled = node({
      text: "Cancel",
      clickable: true,
      enabled: false,
    });
    assert.equal(selectDenyButton([disabled]), null);
  });

  it("returns the first deny button in document order", () => {
    const first = node({ text: "Skip", center: { x: 100, y: 100 } });
    const second = node({ text: "Cancel", center: { x: 200, y: 200 } });
    const result = selectDenyButton([first, second]);
    assert.ok(result);
    assert.equal(result.label, "Skip");
  });
});
