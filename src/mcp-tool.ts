import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { reviewRepository } from "./core.js";
import type { ReviewRequest } from "./types.js";

/**
 * The advertised input contract of the `review_repository` tool.
 *
 * Wire naming is snake_case throughout; the mapping to the camelCase internal
 * `ReviewRequest` happens in exactly one place (`toReviewRequest`) so that the
 * two can be compared. `test/mcp-tool.test.ts` asserts that the set of keys
 * advertised here is exactly the set of keys the mapper reads: a mismatch is
 * otherwise silent, because an unknown property is simply `undefined`.
 */
export const reviewToolInputShape = {
  repo_path: z.string().describe("Absolute path of the Git repository to inspect."),
  base_ref: z
    .string()
    .optional()
    .describe('Git ref to diff HEAD against. Defaults to "main".'),
  validation_commands: z
    .array(z.string())
    .optional()
    .describe("Commands to run inside the repository after collecting changes."),
};

export type ReviewToolInput = z.infer<z.ZodObject<typeof reviewToolInputShape>>;

export function toReviewRequest(input: ReviewToolInput): ReviewRequest {
  return {
    repositoryPath: input.repo_path,
    baseRef: input.base_ref,
    validationCommands: input.validation_commands,
  };
}

export function registerReviewTool(server: McpServer): void {
  server.registerTool(
    "review_repository",
    {
      title: "Review repository",
      description: "Inspects a Git repository and returns a review report.",
      inputSchema: reviewToolInputShape,
    },
    async (input) => {
      const report = await reviewRepository(toReviewRequest(input));
      return { content: [{ type: "text" as const, text: report }] };
    },
  );
}
