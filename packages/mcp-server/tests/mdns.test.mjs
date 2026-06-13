import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseMdnsServices, discoverPairingPort, discoverConnectByHost, __setRunAdbForTest } from "../dist/mdns.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fx = (name) => readFile(resolve(__dirname, "fixtures", "mdns", name), "utf8");

describe("parseMdnsServices", () => {
  it("returns empty arrays for an empty service list", async () => {
    const r = parseMdnsServices(await fx("empty.txt"));
    assert.deepEqual(r.pairing, []);
    assert.deepEqual(r.connect, []);
    assert.equal(r.daemonAvailable, true);
  });

  it("parses a single pairing service", async () => {
    const r = parseMdnsServices(await fx("pairing-only.txt"));
    assert.equal(r.pairing.length, 1);
    assert.equal(r.pairing[0].serviceName, "fling-debug-7f3a");
    assert.equal(r.pairing[0].host, "192.168.1.42");
    assert.equal(r.pairing[0].port, 43581);
    assert.deepEqual(r.connect, []);
  });

  it("parses a single connect service", async () => {
    const r = parseMdnsServices(await fx("connect-only.txt"));
    assert.equal(r.connect.length, 1);
    assert.equal(r.connect[0].serviceName, "adb-RFCN1234ABC-AbCdEf");
    assert.equal(r.connect[0].host, "192.168.1.42");
    assert.equal(r.connect[0].port, 38291);
  });

  it("parses both service types and ignores unrelated services", async () => {
    const r = parseMdnsServices(await fx("both.txt"));
    assert.equal(r.pairing.length, 1);
    assert.equal(r.connect.length, 1);
  });

  it("flags daemonAvailable=false on the ERROR line", async () => {
    const r = parseMdnsServices(await fx("daemon-unavailable.txt"));
    assert.equal(r.daemonAvailable, false);
    assert.deepEqual(r.pairing, []);
    assert.deepEqual(r.connect, []);
  });

  it("handles malformed lines gracefully", () => {
    const r = parseMdnsServices("List of discovered mdns services\ngarbage\n\nsvc _missing_tabs\n");
    assert.deepEqual(r.pairing, []);
    assert.deepEqual(r.connect, []);
  });
});

describe("discoverPairingPort", () => {
  it("resolves with host:port when the named service appears", async () => {
    let calls = 0;
    __setRunAdbForTest(async () => {
      calls += 1;
      if (calls < 2) return { stdout: "List of discovered mdns services\n", stderr: "" };
      return {
        stdout:
          "List of discovered mdns services\n" +
          "fling-debug-aaaa\t_adb-tls-pairing._tcp.\t10.0.0.5:55555\n",
        stderr: "",
      };
    });
    const r = await discoverPairingPort("fling-debug-aaaa", 2000, 50);
    assert.equal(r.host, "10.0.0.5");
    assert.equal(r.port, 55555);
    __setRunAdbForTest(null);
  });

  it("throws PAIRING_TIMEOUT when the service does not appear in time", async () => {
    __setRunAdbForTest(async () => ({ stdout: "List of discovered mdns services\n", stderr: "" }));
    await assert.rejects(
      discoverPairingPort("never-appears", 200, 50),
      (err) => err.code === "PAIRING_TIMEOUT"
    );
    __setRunAdbForTest(null);
  });

  it("throws MDNS_UNAVAILABLE when daemon is unavailable", async () => {
    __setRunAdbForTest(async () => ({ stdout: "ERROR: mdns daemon unavailable\n", stderr: "" }));
    await assert.rejects(
      discoverPairingPort("any", 200, 50),
      (err) => err.code === "MDNS_UNAVAILABLE"
    );
    __setRunAdbForTest(null);
  });
});

describe("discoverConnectByHost", () => {
  it("resolves with the first connect service on the given host", async () => {
    __setRunAdbForTest(async () => ({
      stdout:
        "List of discovered mdns services\n" +
        "adb-XYZ-AbCdEf\t_adb-tls-connect._tcp.\t10.0.0.5:55555\n",
      stderr: "",
    }));
    const r = await discoverConnectByHost("10.0.0.5", 500, 50);
    assert.equal(r.host, "10.0.0.5");
    assert.equal(r.port, 55555);
    __setRunAdbForTest(null);
  });

  it("throws PAIRING_TIMEOUT when no connect service appears for the host", async () => {
    __setRunAdbForTest(async () => ({ stdout: "List of discovered mdns services\n", stderr: "" }));
    await assert.rejects(
      discoverConnectByHost("10.0.0.5", 200, 50),
      (err) => err.code === "PAIRING_TIMEOUT"
    );
    __setRunAdbForTest(null);
  });
});
