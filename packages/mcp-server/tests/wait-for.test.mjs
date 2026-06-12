import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pollUntilFound } from "../dist/tools/wait-for.js";
import { node } from "./test-helpers.mjs";

describe("pollUntilFound", () => {
  it("returns immediately when first dump contains the match", async () => {
    let calls = 0;
    const dumpFn = async () => {
      calls++;
      return [node({ text: "Done loading", center: { x: 100, y: 200 } })];
    };
    const result = await pollUntilFound(
      dumpFn,
      { by: "text", value: "Done loading" },
      { timeoutMs: 5000, pollIntervalMs: 100, now: () => calls * 50 }
    );
    assert.equal(result.found, true);
    assert.equal(result.attempts, 1);
    assert.equal(result.bounds.x1, 0);
    assert.equal(result.center.x, 100);
  });

  it("polls multiple times until the match appears", async () => {
    let calls = 0;
    const dumpFn = async () => {
      calls++;
      if (calls < 3) return [];
      return [node({ text: "Ready" })];
    };
    let virtualMs = 0;
    const result = await pollUntilFound(
      dumpFn,
      { by: "text", value: "Ready" },
      {
        timeoutMs: 5000,
        pollIntervalMs: 100,
        now: () => virtualMs,
        sleep: async (ms) => {
          virtualMs += ms;
        },
      }
    );
    assert.equal(result.found, true);
    assert.equal(result.attempts, 3);
  });

  it("throws UI_WAIT_TIMEOUT when not found within timeoutMs", async () => {
    const dumpFn = async () => [];
    let virtualMs = 0;
    await assert.rejects(
      () =>
        pollUntilFound(
          dumpFn,
          { by: "text", value: "Never" },
          {
            timeoutMs: 500,
            pollIntervalMs: 100,
            now: () => virtualMs,
            sleep: async (ms) => {
              virtualMs += ms;
            },
          }
        ),
      (err) => err.code === "UI_WAIT_TIMEOUT"
    );
  });
});
