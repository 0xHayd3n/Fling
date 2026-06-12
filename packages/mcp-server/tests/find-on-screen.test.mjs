import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildFindOnScreenResult } from "../dist/tools/find-on-screen.js";

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

describe("buildFindOnScreenResult", () => {
  it("returns found:false with count 0 on no matches", () => {
    const result = buildFindOnScreenResult([], { by: "text", value: "x" });
    assert.equal(result.found, false);
    assert.equal(result.count, 0);
    assert.deepEqual(result.matches, []);
    assert.equal(result.truncated, false);
  });

  it("returns one match shape with bounds, center, and relevant fields", () => {
    const nodes = [
      node({
        text: "Photos",
        content_desc: "Photos tab",
        resource_id: "com.foo:id/tab_photos",
        clickable: true,
        bounds: { x1: 0, y1: 100, x2: 200, y2: 200 },
        center: { x: 100, y: 150 },
      }),
    ];
    const result = buildFindOnScreenResult(nodes, { by: "text", value: "Photos" });
    assert.equal(result.found, true);
    assert.equal(result.count, 1);
    assert.equal(result.truncated, false);
    assert.deepEqual(result.matches[0], {
      text: "Photos",
      content_desc: "Photos tab",
      resource_id: "com.foo:id/tab_photos",
      bounds: { x1: 0, y1: 100, x2: 200, y2: 200 },
      center: { x: 100, y: 150 },
      clickable: true,
    });
  });

  it("caps the matches array at 20 and sets truncated:true", () => {
    const nodes = Array.from({ length: 25 }, (_, i) =>
      node({ text: `Item ${i}` })
    );
    const result = buildFindOnScreenResult(nodes, { by: "text", value: "Item" });
    assert.equal(result.count, 25);
    assert.equal(result.matches.length, 20);
    assert.equal(result.truncated, true);
  });
});
