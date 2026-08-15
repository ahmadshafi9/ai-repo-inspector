import { changedFiles } from "./git.js";
import type { ReviewRequest, ReviewResult, ValidationResult } from "./types.js";
import { runValidations } from "./validation.js";

/** Not derived from the repository yet — see "known limitations" in the README. */
export const DEFAULT_BASE_REF = "main";

/**
 * The single review implementation behind both adapters. It returns structured
 * data; rendering is the adapter's job, so the CLI and the MCP server cannot
 * disagree about what a review *is*, only about how it is displayed.
 */
export async function reviewRepository(request: ReviewRequest): Promise<ReviewResult> {
  const baseRef = request.baseRef ?? DEFAULT_BASE_REF;
  const files = changedFiles(request.repositoryPath, baseRef);
  const results = await runValidations(
    request.validationCommands ?? [],
    request.repositoryPath,
  );

  return {
    schemaVersion: 1,
    repositoryPath: request.repositoryPath,
    changes: { baseRef, files },
    validation: { status: summarize(results), results },
  };
}

function summarize(results: ValidationResult[]): ReviewResult["validation"]["status"] {
  if (results.length === 0) return "not-run";
  return results.every((result) => result.status === "passed") ? "passed" : "failed";
}
