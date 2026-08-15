import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerReviewTool, reviewToolInputShape, toReviewRequest } from "../src/mcp-tool.js";
import { reviewResultSchema } from "../src/types.js";
import { createFixtureRepo, removeFixtureRepo } from "./fixture-repo.js";

async function connectedClient(): Promise<Client> {
  const server = new McpServer({ name: "repository-inspector", version: "test" });
  registerReviewTool(server);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "test" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

describe("review_repository input contract", () => {
  it("consumes exactly the keys it advertises", () => {
    const read = new Set<string>();
    const probe = new Proxy(
      { repo_path: "/repo", base_ref: "main", validation_commands: ["npm test"] },
      {
        get(target, key, receiver) {
          if (typeof key === "string") read.add(key);
          return Reflect.get(target, key, receiver);
        },
      },
    );

    const request = toReviewRequest(probe);

    // Both directions matter: a key read but not advertised is always `undefined`
    // at runtime, and a key advertised but never read is a lie to the caller.
    expect([...read].sort()).toEqual(Object.keys(reviewToolInputShape).sort());
    expect(request.repositoryPath).toBe("/repo");
  });

  it("advertises those same keys over the wire", async () => {
    const client = await connectedClient();
    const [tool] = (await client.listTools()).tools;

    expect(tool.name).toBe("review_repository");
    expect(Object.keys(tool.inputSchema.properties ?? {}).sort()).toEqual(
      Object.keys(reviewToolInputShape).sort(),
    );
    expect(tool.inputSchema.required).toEqual(["repo_path"]);
  });
});

describe("review_repository over MCP", () => {
  let repository: string;
  beforeAll(() => {
    repository = createFixtureRepo({
      allowedValidationCommands: ["node --version", "node -e process.exit(1)"],
    });
  });
  afterAll(() => removeFixtureRepo(repository));

  it("inspects the requested repository rather than the server's own directory", async () => {
    const client = await connectedClient();

    const result = await client.callTool({
      name: "review_repository",
      arguments: { repo_path: repository },
    });

    const text = (result.content as { type: string; text: string }[])[0].text;
    expect(result.isError).toBeFalsy();
    expect(text).not.toContain("undefined");
    expect(text).toContain(repository);
    expect(text).toContain("added.txt (added)");
    expect(text).toContain("base.txt (modified)");
  });

  it("returns a structured payload that satisfies the advertised output schema", async () => {
    const client = await connectedClient();

    const result = await client.callTool({
      name: "review_repository",
      arguments: { repo_path: repository, validation_commands: ["node -e process.exit(1)"] },
    });

    // The client validates `structuredContent` against the tool's advertised
    // outputSchema, so reaching this line already proves they agree.
    const payload = reviewResultSchema.parse(result.structuredContent);
    expect(payload.repositoryPath).toBe(repository);
    expect(payload.validation.status).toBe("failed");
  });

  it("refuses a validation command the repository has not allowlisted", async () => {
    const client = await connectedClient();

    const result = await client.callTool({
      name: "review_repository",
      arguments: { repo_path: repository, validation_commands: ["touch pwned.txt"] },
    });

    const text = (result.content as { type: string; text: string }[])[0].text;
    expect(result.isError).toBe(true);
    expect(text).toContain(".inspector.json");
    expect(text).toContain("allowedValidationCommands");
    expect(existsSync(join(repository, "pwned.txt"))).toBe(false);
  });

  it("refuses an allowlisted command with anything appended to it", async () => {
    const client = await connectedClient();

    const result = await client.callTool({
      name: "review_repository",
      arguments: {
        repo_path: repository,
        validation_commands: ["node --version; touch pwned.txt"],
      },
    });

    expect(result.isError).toBe(true);
    expect(existsSync(join(repository, "pwned.txt"))).toBe(false);
  });

  it("refuses a path that is not a Git work tree", async () => {
    const client = await connectedClient();

    const result = await client.callTool({
      name: "review_repository",
      arguments: { repo_path: tmpdir() },
    });

    const text = (result.content as { type: string; text: string }[])[0].text;
    expect(result.isError).toBe(true);
    expect(text).toContain("not inside a Git work tree");
  });

  it("rejects a call that omits the required path", async () => {
    const client = await connectedClient();

    const result = await client.callTool({ name: "review_repository", arguments: {} });

    expect(result.isError).toBe(true);
  });
});
