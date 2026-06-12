import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { launchAndWait } from "../dist/tools/launch-and-wait.js";
import { node } from "./test-helpers.mjs";

describe("launchAndWait", () => {
  it("returns immediately when the ready selector matches on first dump", async () => {
    const launches = [];
    const result = await launchAndWait({
      packageName: "com.example.app",
      readyWhen: { by: "text", value: "Home" },
      launchFn: async (pkg) => launches.push(pkg),
      dumpFn: async () => [node({ text: "Home" })],
      sleepFn: async () => {},
      nowFn: () => 0,
      timeoutMs: 5000,
      pollIntervalMs: 100,
    });
    assert.deepEqual(launches, ["com.example.app"]);
    assert.equal(result.ready, true);
    assert.equal(result.attempts, 1);
  });

  it("polls multiple times until the ready selector appears", async () => {
    let dumps = 0;
    let virtualMs = 0;
    const result = await launchAndWait({
      packageName: "com.example.app",
      readyWhen: { by: "text", value: "Loaded" },
      launchFn: async () => {},
      dumpFn: async () => {
        dumps++;
        if (dumps < 3) return [];
        return [node({ text: "Loaded" })];
      },
      sleepFn: async (ms) => { virtualMs += ms; },
      nowFn: () => virtualMs,
      timeoutMs: 5000,
      pollIntervalMs: 100,
    });
    assert.equal(result.ready, true);
    assert.equal(result.attempts, 3);
  });

  it("throws UI_WAIT_TIMEOUT when ready never appears", async () => {
    let virtualMs = 0;
    await assert.rejects(
      () => launchAndWait({
        packageName: "com.example.app",
        readyWhen: { by: "text", value: "Never" },
        launchFn: async () => {},
        dumpFn: async () => [node({ text: "Other" })],
        sleepFn: async (ms) => { virtualMs += ms; },
        nowFn: () => virtualMs,
        timeoutMs: 30,
        pollIntervalMs: 10,
      }),
      (err) => err.code === "UI_WAIT_TIMEOUT"
    );
  });

  it("matches by resource_id when readyWhen.by === 'resource_id'", async () => {
    const result = await launchAndWait({
      packageName: "com.example.app",
      readyWhen: { by: "resource_id", value: "com.example.app:id/main" },
      launchFn: async () => {},
      dumpFn: async () => [node({ resource_id: "com.example.app:id/main" })],
      sleepFn: async () => {},
      nowFn: () => 0,
      timeoutMs: 1000,
      pollIntervalMs: 100,
    });
    assert.equal(result.ready, true);
  });
});
