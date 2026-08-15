import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { POLICY_FILE, allowlistPolicy, unrestrictedPolicy } from "../src/policy.js";
import { InspectorError } from "../src/types.js";

const directories: string[] = [];

function repositoryWith(policyFileContents?: string): string {
  const directory = mkdtempSync(join(tmpdir(), "inspector-policy-"));
  directories.push(directory);
  if (policyFileContents !== undefined) {
    writeFileSync(join(directory, POLICY_FILE), policyFileContents);
  }
  return directory;
}

afterEach(() => {
  while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true });
});

describe("allowlistPolicy", () => {
  it("allows an exactly matching command as an argv vector", () => {
    const policy = allowlistPolicy(repositoryWith('{"allowedValidationCommands":["npm run typecheck"]}'));

    expect(policy.authorize("npm run typecheck")).toEqual({
      allowed: true,
      command: { command: "npm run typecheck", execution: "argv", argv: ["npm", "run", "typecheck"] },
    });
  });

  it("denies everything when the repository has no policy file, and says how to add one", () => {
    const repository = repositoryWith();

    const authorization = allowlistPolicy(repository).authorize("npm test");

    expect(authorization.allowed).toBe(false);
    expect(authorization.allowed === false && authorization.reason).toContain(
      join(repository, POLICY_FILE),
    );
    expect(authorization.allowed === false && authorization.reason).toContain(
      "allowedValidationCommands",
    );
  });

  it("denies everything when the allowlist is empty", () => {
    const policy = allowlistPolicy(repositoryWith('{"allowedValidationCommands":[]}'));

    expect(policy.authorize("npm test").allowed).toBe(false);
  });

  it.each([
    ["npm test; touch pwned", "a shell suffix"],
    ["npm test --silent", "an appended argument"],
    ["npm", "a prefix of an allowed command"],
    [" npm test", "leading whitespace"],
  ])('denies "%s" (%s)', (command) => {
    const policy = allowlistPolicy(repositoryWith('{"allowedValidationCommands":["npm test"]}'));

    expect(policy.authorize(command).allowed).toBe(false);
  });

  it.each([
    ["not JSON at all", "{"],
    ["the wrong type", '{"allowedValidationCommands":"npm test"}'],
    ["an unknown key", '{"allowedValidationCommands":[],"allowAll":true}'],
  ])("fails closed on %s", (_name, contents) => {
    const policy = allowlistPolicy(repositoryWith(contents));

    expect(() => policy.authorize("npm test")).toThrow(InspectorError);
  });

  it("does not read the policy file until a command is actually authorized", () => {
    // A review with no validation commands must work in a repository that has
    // no policy file at all.
    expect(() => allowlistPolicy(repositoryWith("{"))).not.toThrow();
  });
});

describe("unrestrictedPolicy", () => {
  it("allows an arbitrary command through a shell, for callers that already have one", () => {
    expect(unrestrictedPolicy().authorize("exit 1")).toEqual({
      allowed: true,
      command: { command: "exit 1", execution: "shell" },
    });
  });
});
