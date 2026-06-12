import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildSwipeArgs,
  scrollAndSearch,
} from "../dist/tools/scroll-until-visible.js";
import { node } from "./test-helpers.mjs";

describe("buildSwipeArgs", () => {
  it('builds a down swipe from 80% to 20% of screen height', () => {
    const argv = buildSwipeArgs(["-s", "abc"], "down", 1080, 2400);
    // y1 = 2400 * 0.8 = 1920, y2 = 2400 * 0.2 = 480, x = 540, duration = 500
    assert.deepEqual(argv, [
      "-s",
      "abc",
      "shell",
      "input",
      "swipe",
      "540",
      "1920",
      "540",
      "480",
      "500",
    ]);
  });

  it("builds an up swipe (reversed)", () => {
    const argv = buildSwipeArgs(["-s", "abc"], "up", 1080, 2400);
    assert.equal(argv[6], "480"); // y1 = 20%
    assert.equal(argv[8], "1920"); // y2 = 80%
  });
});

describe("scrollAndSearch", () => {
  it("returns immediately found:true when first dump matches", async () => {
    let dumps = 0;
    let swipes = 0;
    const dumpFn = async () => {
      dumps++;
      return [node({ text: "Privacy", center: { x: 100, y: 200 } })];
    };
    const swipeFn = async () => {
      swipes++;
    };
    const result = await scrollAndSearch(
      dumpFn,
      swipeFn,
      { by: "text", value: "Privacy" },
      { maxScrolls: 10 }
    );
    assert.equal(result.found, true);
    assert.equal(result.scrolls_performed, 0);
    assert.equal(dumps, 1);
    assert.equal(swipes, 0);
  });

  it("scrolls until match appears", async () => {
    let dumps = 0;
    let swipes = 0;
    const dumpFn = async () => {
      dumps++;
      if (dumps < 4) return [];
      return [node({ text: "Found" })];
    };
    const swipeFn = async () => {
      swipes++;
    };
    const result = await scrollAndSearch(
      dumpFn,
      swipeFn,
      { by: "text", value: "Found" },
      { maxScrolls: 10 }
    );
    assert.equal(result.found, true);
    assert.equal(result.scrolls_performed, 3);
    assert.equal(swipes, 3);
  });

  it("returns found:false after max_scrolls", async () => {
    const dumpFn = async () => [];
    let swipes = 0;
    const swipeFn = async () => {
      swipes++;
    };
    const result = await scrollAndSearch(
      dumpFn,
      swipeFn,
      { by: "text", value: "Never" },
      { maxScrolls: 4 }
    );
    assert.equal(result.found, false);
    assert.equal(result.scrolls_performed, 4);
    assert.equal(swipes, 4);
  });
});
