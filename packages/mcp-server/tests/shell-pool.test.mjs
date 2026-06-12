import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { AdbShell } from "../dist/shellPool.js";

// Minimal fake ChildProcess. Tests push data into stdout and call
// .emit('exit', code) to simulate the real adb shell process lifecycle.
function makeFakeChild() {
  const child = new EventEmitter();
  child.stdin = {
    written: "",
    write(chunk) {
      this.written += String(chunk);
      return true;
    },
    end() {},
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  child.kill = function () {
    child.killed = true;
    setImmediate(() => child.emit("exit", null, "SIGTERM"));
  };
  return child;
}

describe("AdbShell — lifecycle", () => {
  it("does not spawn until the first exec / _ensureSpawned", () => {
    let spawned = 0;
    const shell = new AdbShell("SERIAL", {
      spawnImpl: () => {
        spawned++;
        return makeFakeChild();
      },
    });
    assert.equal(spawned, 0);
  });

  it("_ensureSpawned spawns once and returns the same child on repeat", () => {
    const childs = [];
    const shell = new AdbShell("SERIAL", {
      spawnImpl: () => {
        const c = makeFakeChild();
        childs.push(c);
        return c;
      },
    });
    const a = shell._ensureSpawned();
    const b = shell._ensureSpawned();
    assert.equal(childs.length, 1);
    assert.equal(a, b);
  });

  it("shutdown() kills the child and rejects further execs with ADB_SHELL_SHUT_DOWN", async () => {
    const child = makeFakeChild();
    const shell = new AdbShell("SERIAL", { spawnImpl: () => child });
    shell._ensureSpawned();
    shell.shutdown();
    assert.equal(child.killed, true);
    await assert.rejects(() => shell.exec("ls"), (err) => err.code === "ADB_SHELL_SHUT_DOWN");
  });

  it("shutdown() before any spawn is a no-op for the child and still blocks exec", async () => {
    let spawned = 0;
    const shell = new AdbShell("SERIAL", {
      spawnImpl: () => {
        spawned++;
        return makeFakeChild();
      },
    });
    shell.shutdown();
    assert.equal(spawned, 0);
    await assert.rejects(() => shell.exec("ls"), (err) => err.code === "ADB_SHELL_SHUT_DOWN");
  });
});

// Helper: drive a single exec() to completion against a fake child.
// Returns { promise, child, token, seq } so the test can inspect what was
// written and emit the matching sentinel.
function startExec(shell, cmd) {
  const child = shell._ensureSpawned();
  const beforeWritten = child.stdin.written;
  const promise = shell.exec(cmd);
  // exec() is sync up to the stdin.write — read what was added.
  // (The fake stdin.write captures synchronously.)
  return { promise, child, beforeWritten };
}

function tokenFromStdin(written) {
  const m = written.match(/__FLING_RC_([0-9a-f]{8})_(\d+)__/);
  if (!m) throw new Error(`no sentinel in stdin: ${written}`);
  return { token: m[1], seq: Number(m[2]) };
}

describe("AdbShell — exec happy path", () => {
  it("writes a framed command to stdin and resolves with stdout + exit code", async () => {
    const child = makeFakeChild();
    const shell = new AdbShell("S", { spawnImpl: () => child });
    const { promise } = startExec(shell, "echo hello");

    const { token, seq } = tokenFromStdin(child.stdin.written);
    assert.equal(seq, 1);
    // Sanity-check the framed format.
    assert.match(
      child.stdin.written,
      new RegExp(`^echo hello ; printf '\\\\n__FLING_RC_${token}_1__%d\\\\n' \\$\\?\\n$`)
    );

    // Realistic wire format: printf prepends \n so the sentinel always
    // starts at column 0, even when the command's last output line had no
    // trailing newline.
    child.stdout.emit("data", Buffer.from("hello\n"));
    child.stdout.emit("data", Buffer.from(`\n__FLING_RC_${token}_1__0\n`));

    const result = await promise;
    assert.equal(result.stdout, "hello\n");
    assert.equal(result.exitCode, 0);
  });

  it("captures non-zero exit codes", async () => {
    const child = makeFakeChild();
    const shell = new AdbShell("S", { spawnImpl: () => child });
    const { promise } = startExec(shell, "false");
    const { token } = tokenFromStdin(child.stdin.written);
    child.stdout.emit("data", Buffer.from(`\n__FLING_RC_${token}_1__127\n`));
    const result = await promise;
    assert.equal(result.exitCode, 127);
    assert.equal(result.stdout, "");
  });

  it("handles output split across multiple data chunks", async () => {
    const child = makeFakeChild();
    const shell = new AdbShell("S", { spawnImpl: () => child });
    const { promise } = startExec(shell, "cat file");
    const { token } = tokenFromStdin(child.stdin.written);

    // Split the output across chunks, including mid-line, including the
    // framing separator newline.
    child.stdout.emit("data", Buffer.from("li"));
    child.stdout.emit("data", Buffer.from("ne1\nli"));
    child.stdout.emit("data", Buffer.from("ne2\n\n__FLING_R"));
    child.stdout.emit("data", Buffer.from(`C_${token}_1__0\n`));

    const result = await promise;
    assert.equal(result.stdout, "line1\nline2\n");
    assert.equal(result.exitCode, 0);
  });

  it("handles an empty stdout (only sentinel)", async () => {
    const child = makeFakeChild();
    const shell = new AdbShell("S", { spawnImpl: () => child });
    const { promise } = startExec(shell, "true");
    const { token } = tokenFromStdin(child.stdin.written);
    child.stdout.emit("data", Buffer.from(`\n__FLING_RC_${token}_1__0\n`));
    const result = await promise;
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, "");
  });
});
