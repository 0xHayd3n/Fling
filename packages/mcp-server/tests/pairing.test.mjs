import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  startPairQr,
  pairWithCode,
  __setRunAdbForTest as setPairAdb,
  __setDiscoverForTest,
} from "../dist/pairing.js";

const recordStatuses = () => {
  const list = [];
  return [list, (s) => list.push(s.kind)];
};

describe("startPairQr", () => {
  it("emits waiting -> pairing -> connecting -> success on the happy path", async () => {
    const [statuses, onStatus] = recordStatuses();
    setPairAdb(async (args) => {
      if (args[0] === "pair") return { stdout: "Successfully paired to 10.0.0.5:44 [guid=...]", stderr: "" };
      if (args[0] === "connect") return { stdout: "connected to 10.0.0.5:55", stderr: "" };
      if (args[0] === "devices") return {
        stdout: "List of devices attached\n10.0.0.5:55\tdevice product:p model:Pixel_7 device:p transport_id:1\n",
        stderr: "",
      };
      throw new Error(`unexpected adb args: ${args.join(" ")}`);
    });
    __setDiscoverForTest({
      discoverPairingPort: async () => ({ host: "10.0.0.5", port: 44, serviceName: "fling-debug-aaaa" }),
      discoverConnectByHost: async () => ({ host: "10.0.0.5", port: 55, serviceName: "adb-S-X" }),
    });

    const r = startPairQr({ onStatus, timeoutMs: 2000 });
    assert.ok(r.qrText.startsWith("WIFI:T:ADB;"));
    assert.ok(r.serviceName.startsWith("fling-debug-"));
    const terminal = await r.done;
    assert.equal(terminal.kind, "success");
    assert.deepEqual(statuses, ["waiting", "pairing", "connecting", "success"]);
    assert.equal(terminal.serial, "10.0.0.5:55");
    assert.equal(terminal.model, "Pixel_7");

    setPairAdb(null);
    __setDiscoverForTest(null);
  });

  it("emits timeout when mDNS discovery times out", async () => {
    const [statuses, onStatus] = recordStatuses();
    setPairAdb(async () => ({ stdout: "", stderr: "" }));
    __setDiscoverForTest({
      discoverPairingPort: async () => {
        const e = new Error("no svc");
        e.code = "PAIRING_TIMEOUT";
        throw e;
      },
      discoverConnectByHost: async () => ({ host: "", port: 0, serviceName: "" }),
    });

    const r = startPairQr({ onStatus, timeoutMs: 1000 });
    const terminal = await r.done;
    assert.equal(terminal.kind, "timeout");
    assert.deepEqual(statuses, ["waiting", "timeout"]);

    setPairAdb(null);
    __setDiscoverForTest(null);
  });

  it("emits error with ADB_PAIR_FAILED when adb pair returns non-zero", async () => {
    const [statuses, onStatus] = recordStatuses();
    setPairAdb(async (args) => {
      if (args[0] === "pair") {
        const e = new Error("pair failed");
        e.code = "ADB_FAILED";
        e.stderr = "Failed: Wrong password";
        throw e;
      }
      return { stdout: "", stderr: "" };
    });
    __setDiscoverForTest({
      discoverPairingPort: async () => ({ host: "10.0.0.5", port: 44, serviceName: "x" }),
      discoverConnectByHost: async () => ({ host: "10.0.0.5", port: 55, serviceName: "y" }),
    });

    const r = startPairQr({ onStatus, timeoutMs: 1000 });
    const terminal = await r.done;
    assert.equal(terminal.kind, "error");
    assert.match(terminal.reason, /Wrong password|pair failed/);
    assert.deepEqual(statuses, ["waiting", "pairing", "error"]);

    setPairAdb(null);
    __setDiscoverForTest(null);
  });

  it("cancels via AbortSignal", async () => {
    const [statuses, onStatus] = recordStatuses();
    setPairAdb(async () => ({ stdout: "", stderr: "" }));
    __setDiscoverForTest({
      discoverPairingPort: async () => new Promise(() => {}), // never resolves
      discoverConnectByHost: async () => ({ host: "", port: 0, serviceName: "" }),
    });
    const ac = new AbortController();
    const r = startPairQr({ onStatus, timeoutMs: 5000, signal: ac.signal });
    setTimeout(() => ac.abort(), 50);
    const terminal = await r.done;
    assert.equal(terminal.kind, "error");
    assert.match(terminal.reason, /cancel|abort/i);

    setPairAdb(null);
    __setDiscoverForTest(null);
  });
});

describe("pairWithCode", () => {
  it("returns success on a valid pair+connect", async () => {
    setPairAdb(async (args) => {
      if (args[0] === "pair") return { stdout: "Successfully paired to 10.0.0.5:44", stderr: "" };
      if (args[0] === "connect") return { stdout: "connected to 10.0.0.5:55", stderr: "" };
      if (args[0] === "devices") return {
        stdout: "List of devices attached\n10.0.0.5:55\tdevice product:p model:Pixel_8 device:p transport_id:1\n",
        stderr: "",
      };
      return { stdout: "", stderr: "" };
    });
    __setDiscoverForTest({
      discoverPairingPort: async () => ({ host: "10.0.0.5", port: 44, serviceName: "x" }),
      discoverConnectByHost: async () => ({ host: "10.0.0.5", port: 55, serviceName: "y" }),
    });

    const r = await pairWithCode({ host: "10.0.0.5", port: 44, code: "836281" });
    assert.equal(r.kind, "success");
    assert.equal(r.model, "Pixel_8");

    setPairAdb(null);
    __setDiscoverForTest(null);
  });
});
