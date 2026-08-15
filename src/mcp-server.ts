#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerReviewTool } from "./mcp-tool.js";

const server = new McpServer({ name: "repository-inspector", version: "2.0.0" });
registerReviewTool(server);

await server.connect(new StdioServerTransport());
