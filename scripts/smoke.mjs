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
  {
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "install_app",
      arguments: { apk_path: "./does-not-exist.apk" },
    },
  },
  {
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: {
      name: "launch_app",
      arguments: { package_name: "com.example.fake" },
    },
  },
  {
    jsonrpc: "2.0",
    id: 6,
    method: "tools/call",
    params: {
      name: "read_logs",
      arguments: { lines: 50 },
    },
  },
  {
    jsonrpc: "2.0",
    id: 7,
    method: "tools/call",
    params: {
      name: "launch_app",
      arguments: { package_name: "not a valid package!" },
    },
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
}, 3000);

const SHOW_FULL = process.argv.includes("--full");

function summarize(msg) {
  if (msg.id === 1) {
    return `initialize → ${msg.result?.serverInfo?.name}@${msg.result?.serverInfo?.version}`;
  }
  if (msg.id === 2) {
    const names = (msg.result?.tools ?? []).map((t) => t.name).join(", ");
    return `tools/list → [${names}]`;
  }
  const id = msg.id;
  const req = requests.find((r) => r.id === id);
  const callName = req?.params?.name ?? "?";
  if (msg.result) {
    const text = msg.result.content?.[0]?.text ?? "";
    const truncated = text.length > 220 ? text.slice(0, 220) + "…" : text;
    const flag = msg.result.isError ? "isError" : "ok";
    return `tools/call ${callName} → ${flag}: ${truncated.replace(/\n/g, " ⏎ ")}`;
  }
  if (msg.error) {
    return `tools/call ${callName} → JSON-RPC error: ${msg.error.message}`;
  }
  return `tools/call ${callName} → (no result)`;
}

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

  console.log(`=== exit code: ${code}`);
  if (stderrBuf.trim()) {
    console.log("=== stderr:");
    console.log(stderrBuf);
  }
  console.log("=== responses:");
  for (const msg of lines) {
    if (SHOW_FULL) {
      console.log(JSON.stringify(msg, null, 2));
    } else {
      console.log("  " + summarize(msg));
    }
  }
});
