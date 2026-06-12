#!/usr/bin/env node
// Manual integration smoke test — requires a real device.
//
// Run via:
//   FLING_INTEGRATION=1 node scripts/shell-pool-smoke.mjs
//
// Benchmarks 100 `input keyevent KEYCODE_WAKEUP` calls through the shell
// pool against the same workload via runAdb (process per call). Prints
// p50/p99 for each and asserts the pool is at least 5x faster at p50.

import { performance } from "node:perf_hooks";
import { shell, shutdownPool } from "../dist/shellPool.js";
import { runAdb } from "../dist/adb.js";
import { listDevices } from "../dist/devices.js";

if (!process.env.FLING_INTEGRATION) {
  console.error("Set FLING_INTEGRATION=1 to run this smoke test.");
  process.exit(2);
}

function percentile(samples, p) {
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function bench(label, fn, n = 100) {
  const samples = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    await fn();
    samples.push(performance.now() - t0);
  }
  const p50 = percentile(samples, 50);
  const p99 = percentile(samples, 99);
  console.log(`${label}: p50=${p50.toFixed(1)}ms p99=${p99.toFixed(1)}ms`);
  return { samples, p50, p99 };
}

const devices = await listDevices();
const ready = devices.find((d) => d.state === "device");
if (!ready) {
  console.error("No ready device. Plug in a phone with USB Debugging enabled.");
  process.exit(2);
}
const serial = ready.serial;
console.log(`Using device ${serial} (${ready.model ?? ready.product ?? "unknown"}).`);

// Warm both code paths (avoid first-call adb-server cold-start skewing samples).
await runAdb(["-s", serial, "shell", "true"]);
await shell(serial, "true");

const pool = await bench("shell pool", async () => {
  await shell(serial, "input keyevent KEYCODE_WAKEUP");
});

const direct = await bench("runAdb    ", async () => {
  await runAdb(["-s", serial, "shell", "input", "keyevent", "KEYCODE_WAKEUP"]);
});

const speedup = direct.p50 / pool.p50;
console.log(`\nSpeedup (p50): ${speedup.toFixed(1)}x`);

shutdownPool();

if (speedup < 5) {
  console.error("FAIL: expected >=5x p50 speedup.");
  process.exit(1);
}
console.log("PASS.");
