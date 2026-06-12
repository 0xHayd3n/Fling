import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectTapByResourceId } from "../dist/tools/tap-by-resource-id.js";

function node(overrides = {}) {
  return {
    text: "",
    content_desc: "",
    resource_id: "",
    class: "android.view.View",
    package: "com.example",
    bounds: { x1: 0, y1: 0, x2: 100, y2: 100 },
    center: { x: 50, y: 50 },
    clickable: false,
    long_clickable: false,
    scrollable: false,
    focusable: false,
    focused: false,
    enabled: true,
    selected: false,
    checkable: false,
    checked: false,
    ...overrides,
  };
}

describe("selectTapByResourceId", () => {
  it("returns null when no node has that resource_id", () => {
    const result = selectTapByResourceId([node({ text: "Hi" })], "com.foo:id/missing");
    assert.equal(result, null);
  });

  it("matches exactly and reports the tap target", () => {
    const target = node({
      resource_id: "com.foo:id/search",
      clickable: true,
      bounds: { x1: 0, y1: 100, x2: 200, y2: 200 },
      center: { x: 100, y: 150 },
    });
    const result = selectTapByResourceId([target], "com.foo:id/search");
    assert.ok(result);
    assert.equal(result.tap_x, 100);
    assert.equal(result.tap_y, 150);
    assert.equal(result.matched_resource_id, "com.foo:id/search");
    assert.equal(result.candidates_count, 1);
  });

  it("does NOT match a substring (resource_id is exact-only)", () => {
    const nodes = [node({ resource_id: "com.foo:id/search_bar" })];
    const result = selectTapByResourceId(nodes, "search");
    assert.equal(result, null);
  });
});
