import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { InspectorError } from "./types.js";

export const POLICY_FILE = ".inspector.json";

const EXAMPLE = '{"allowedValidationCommands": ["npm test", "npm run typecheck"]}';

/** Unknown keys are rejected: a policy this tool cannot fully understand must not be half-applied. */
const policyFileSchema = z
  .object({ allowedValidationCommands: z.array(z.string()) })
  .strict();

export type AuthorizedCommand =
  | { command: string; execution: "argv"; argv: string[] }
  | { command: string; execution: "shell" };

export type Authorization =
  | { allowed: true; command: AuthorizedCommand }
  | { allowed: false; reason: string };

export type ValidationPolicy = {
  authorize(command: string): Authorization;
};

/**
 * Policy for untrusted callers (the MCP server). The caller is a model that may
 * have just read attacker-influenced content from the repository it is asking
 * about, so:
 *
 *  - nothing runs through a shell — commands are argv vectors;
 *  - a command must match an entry of `.inspector.json` in the repository root
 *    exactly, so there is no prefix, substring or argument-appending trick;
 *  - an absent, empty or malformed policy file allows nothing at all. There is
 *    deliberately no permissive fallback.
 */
export function allowlistPolicy(repositoryRoot: string): ValidationPolicy {
  let allowed: string[] | undefined;

  return {
    authorize(command) {
      allowed ??= readAllowlist(repositoryRoot);
      if (!allowed.includes(command)) {
        return { allowed: false, reason: denialReason(command, repositoryRoot, allowed) };
      }
      const argv = command.trim().split(/\s+/);
      return { allowed: true, command: { command, execution: "argv", argv } };
    },
  };
}

/**
 * Policy for trusted callers (the CLI). Its caller already has a shell, so
 * withholding one buys nothing; commands run through one, unfiltered. This
 * asymmetry is the point: same core, different trust level, stated out loud.
 */
export function unrestrictedPolicy(): ValidationPolicy {
  return {
    authorize: (command) => ({ allowed: true, command: { command, execution: "shell" } }),
  };
}

function readAllowlist(repositoryRoot: string): string[] {
  const path = join(repositoryRoot, POLICY_FILE);
  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new InspectorError(`${path} is not valid JSON. Expected, for example: ${EXAMPLE}`);
  }

  const result = policyFileSchema.safeParse(parsed);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new InspectorError(`${path} is not a valid policy file (${problems}). Expected: ${EXAMPLE}`);
  }
  return result.data.allowedValidationCommands;
}

function denialReason(command: string, repositoryRoot: string, allowed: string[]): string {
  const path = join(repositoryRoot, POLICY_FILE);
  const state =
    allowed.length === 0
      ? `No validation command is currently allowed. Create ${path} containing, for example: ${EXAMPLE}`
      : `Allowed commands are: ${allowed.map((entry) => `"${entry}"`).join(", ")}. Add this one to "allowedValidationCommands" in ${path} if it should be permitted.`;
  return `Validation command "${command}" is not allowed by this repository's policy. Commands must match an allowlist entry exactly. ${state}`;
}
