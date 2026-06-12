import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectTapByContentDesc } from "../dist/tools/tap-by-content-desc.js";
import { node } from "./test-helpers.mjs";

describe("selectTapByContentDesc", () => {
  it("returns null on no match", () => {
    const result = selectTapByContentDesc([node({ text: "Hi" })], "Search", false);
    assert.equal(result, null);
  });

  it("matches substring by default", () => {
    const target = node({
      content_desc: "Search button",
      clickable: true,
      bounds: { x1: 0, y1: 0, x2: 80, y2: 80 },
      center: { x: 40, y: 40 },
    });
    const result = selectTapByContentDesc([target], "Search", false);
    assert.ok(result);
    assert.equal(result.matched_content_desc, "Search button");
    assert.equal(result.tap_x, 40);
  });

  it("exact:true requires equality", () => {
    const nodes = [
      node({ content_desc: "Dismiss" }),
      node({ content_desc: "Dismiss dialog" }),
    ];
    const result = selectTapByContentDesc(nodes, "Dismiss", true);
    assert.ok(result);
    assert.equal(result.matched_content_desc, "Dismiss");
    assert.equal(result.candidates_count, 1);
  });
});
