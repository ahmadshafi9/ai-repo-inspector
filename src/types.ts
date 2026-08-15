import { z } from "zod";

/**
 * The tool's public contract, defined once as Zod schemas and inferred into
 * TypeScript. The MCP adapter advertises these same schemas as its
 * `outputSchema`, so the payload an agent receives is validated against the
 * types this codebase compiles against — they cannot drift.
 */

export const changedFileSchema = z.object({
  path: z.string(),
  status: z.enum(["added", "modified", "deleted", "untracked"]),
});
export type ChangedFile = z.infer<typeof changedFileSchema>;

export const validationResultSchema = z.object({
  command: z.string(),
  status: z.enum(["passed", "failed"]),
  exitCode: z
    .number()
    .nullable()
    .describe("Process exit code, or null when the command was killed before exiting."),
  output: z.string().describe("Combined stdout and stderr, possibly truncated."),
  outputTruncated: z.boolean().describe("True when `output` is an excerpt rather than the whole."),
  outputChars: z.number().int().describe("Length of the untruncated output, in characters."),
});
export type ValidationResult = z.infer<typeof validationResultSchema>;

/** Raw shape rather than a `z.object`, because MCP output schemas take a shape. */
export const reviewResultShape = {
  schemaVersion: z.literal(1).describe("Incremented on any breaking change to this payload."),
  repositoryPath: z.string().describe("The repository that was actually inspected."),
  changes: z.object({
    baseRef: z.string().describe("The ref HEAD was diffed against."),
    files: z.array(changedFileSchema),
    truncated: z.boolean().describe("True when `files` lists only some of the changed files."),
    totalFiles: z.number().int().describe("Number of changed files before any truncation."),
  }),
  validation: z.object({
    status: z
      .enum(["passed", "failed", "not-run"])
      .describe('"not-run" when no validation commands were requested.'),
    results: z.array(validationResultSchema),
  }),
};
export const reviewResultSchema = z.object(reviewResultShape);
export type ReviewResult = z.infer<typeof reviewResultSchema>;

/**
 * A failure the caller can fix (a bad path, a command the repository's policy
 * forbids). Carries a message meant to be read and acted on, not a stack trace.
 */
export class InspectorError extends Error {
  override readonly name = "InspectorError";
}

/**
 * How much the caller is trusted. Required, and with no default, so that every
 * adapter has to state it: this is the field that decides whether a validation
 * command reaches a shell.
 */
export type CallerTrust = "untrusted-caller" | "trusted-shell-caller";

export type ReviewRequest = {
  repositoryPath: string;
  callerTrust: CallerTrust;
  baseRef?: string;
  validationCommands?: string[];
};
