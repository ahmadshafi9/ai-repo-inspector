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
  output: z.string().describe("Combined stdout and stderr."),
});
export type ValidationResult = z.infer<typeof validationResultSchema>;

/** Raw shape rather than a `z.object`, because MCP output schemas take a shape. */
export const reviewResultShape = {
  schemaVersion: z.literal(1).describe("Incremented on any breaking change to this payload."),
  repositoryPath: z.string().describe("The repository that was actually inspected."),
  changes: z.object({
    baseRef: z.string().describe("The ref HEAD was diffed against."),
    files: z.array(changedFileSchema),
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

export type ReviewRequest = {
  repositoryPath: string;
  baseRef?: string;
  validationCommands?: string[];
};
