#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerBuildApp } from "./tools/build-app.js";
import { registerDeployAndRun } from "./tools/deploy-and-run.js";
import { registerDumpUi } from "./tools/dump-ui.js";
import { registerFindOnScreen } from "./tools/find-on-screen.js";
import { registerInstallApp } from "./tools/install-app.js";
import { registerLaunchApp } from "./tools/launch-app.js";
import { registerListDevices } from "./tools/list-devices.js";
import { registerReadLogs } from "./tools/read-logs.js";
import { registerScreenshot } from "./tools/screenshot.js";
import { registerStopApp } from "./tools/stop-app.js";
import { registerTapByContentDesc } from "./tools/tap-by-content-desc.js";
import { registerTapByResourceId } from "./tools/tap-by-resource-id.js";
import { registerTapByText } from "./tools/tap-by-text.js";
import { registerLongPressByText } from "./tools/long-press-by-text.js";
import { registerDismissDialog } from "./tools/dismiss-dialog.js";
import { registerUninstallApp } from "./tools/uninstall-app.js";
import { registerWaitFor } from "./tools/wait-for.js";
import { registerScrollUntilVisible } from "./tools/scroll-until-visible.js";
import { registerOpenSetting } from "./tools/open-setting.js";
import { registerTapTextVerified } from "./tools/tap-text-verified.js";
import { registerLaunchAndWait } from "./tools/launch-and-wait.js";
import { registerScreenshotWithUi } from "./tools/screenshot-with-ui.js";
import { registerDeviceState } from "./tools/device-state.js";
import { registerStartPairQr } from "./tools/start-pair-qr.js";
import { registerWaitForPair } from "./tools/wait-for-pair.js";
import { shutdownPool } from "./shellPool.js";

const SERVER_NAME = "fling";
const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
const SERVER_VERSION = (JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string }).version;

async function main() {
  process.on("exit", () => shutdownPool());
  process.on("SIGINT", () => {
    shutdownPool();
    process.exit(0);
  });

  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerListDevices(server);
  registerBuildApp(server);
  registerInstallApp(server);
  registerLaunchApp(server);
  registerStopApp(server);
  registerUninstallApp(server);
  registerReadLogs(server);
  registerScreenshot(server);
  registerTapByText(server);
  registerTapByResourceId(server);
  registerTapByContentDesc(server);
  registerLongPressByText(server);
  registerDismissDialog(server);
  registerWaitFor(server);
  registerScrollUntilVisible(server);
  registerDumpUi(server);
  registerFindOnScreen(server);
  registerDeployAndRun(server);
  registerOpenSetting(server);
  registerTapTextVerified(server);
  registerLaunchAndWait(server);
  registerScreenshotWithUi(server);
  registerDeviceState(server);
  registerStartPairQr(server);
  registerWaitForPair(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(
    `[fling] fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`
  );
  process.exit(1);
});
