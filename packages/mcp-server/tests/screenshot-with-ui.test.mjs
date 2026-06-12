import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { captureScreenshotWithUi } from "../dist/tools/screenshot-with-ui.js";
import { node } from "./test-helpers.mjs";

describe("captureScreenshotWithUi", () => {
  it("runs screenshot and uiDump in parallel and returns both", async () => {
    const order = [];
    const screenshotFn = async () => {
      order.push("shot-start");
      await new Promise((r) => setTimeout(r, 10));
      order.push("shot-end");
      return Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG signature prefix
    };
    const dumpFn = async () => {
      order.push("dump-start");
      await new Promise((r) => setTimeout(r, 10));
      order.push("dump-end");
      return [node({ text: "Hello" }), node({ text: "World" })];
    };
    const result = await captureScreenshotWithUi({ screenshotFn, dumpFn });
    assert.equal(result.bytes, 4);
    assert.equal(result.nodes.length, 2);
    assert.equal(result.node_count, 2);
    assert.match(result.png_base64, /^[A-Za-z0-9+/=]+$/);

    // Both started before either finished (parallel, not sequential).
    assert.equal(order[0], "shot-start");
    assert.equal(order[1], "dump-start");
  });

  it("propagates errors from either source", async () => {
    await assert.rejects(
      () => captureScreenshotWithUi({
        screenshotFn: async () => { throw new Error("screencap blew up"); },
        dumpFn: async () => [],
      }),
      /screencap blew up/
    );
    await assert.rejects(
      () => captureScreenshotWithUi({
        screenshotFn: async () => Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        dumpFn: async () => { throw new Error("ui dump failed"); },
      }),
      /ui dump failed/
    );
  });
});
