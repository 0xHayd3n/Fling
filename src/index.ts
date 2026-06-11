#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerBuildApp } from "./tools/build-app.js";
import { registerDeployAndRun } from "./tools/deploy-and-run.js";
import { registerInstallApp } from "./tools/install-app.js";
import { registerLaunchApp } from "./tools/launch-app.js";
import { registerListDevices } from "./tools/list-devices.js";
import { registerReadLogs } from "./tools/read-logs.js";

const SERVER_NAME = "fling";
const SERVER_VERSION = "0.3.0";

async function main() {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerListDevices(server);
  registerBuildApp(server);
  registerInstallApp(server);
  registerLaunchApp(server);
  registerReadLogs(server);
  registerDeployAndRun(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(
    `[fling] fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`
  );
  process.exit(1);
});
