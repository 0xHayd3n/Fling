#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverEntry = resolve(__dirname, "..", "dist", "index.js");

const requests = [
  {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "fling-smoke", version: "0.0.0" },
    },
  },
  { jsonrpc: "2.0", method: "notifications/initialized" },
  { jsonrpc: "2.0", id: 2, method: "tools/list" },
  {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "list_devices", arguments: {} },
  },
];

const child = spawn(process.execPath, [serverEntry], {
  stdio: ["pipe", "pipe", "pipe"],
  env: process.env,
});

let stdoutBuf = "";
let stderrBuf = "";

child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");

child.stdout.on("data", (chunk) => {
  stdoutBuf += chunk;
});
child.stderr.on("data", (chunk) => {
  stderrBuf += chunk;
});

for (const req of requests) {
  child.stdin.write(JSON.stringify(req) + "\n");
}

setTimeout(() => {
  child.stdin.end();
}, 1500);

child.on("close", (code) => {
  const lines = stdoutBuf
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return { __raw: l };
      }
    });

  console.log("=== exit code:", code);
  if (stderrBuf.trim()) {
    console.log("=== stderr:");
    console.log(stderrBuf);
  }
  console.log("=== responses:");
  for (const msg of lines) {
    console.log(JSON.stringify(msg, null, 2));
  }
});
