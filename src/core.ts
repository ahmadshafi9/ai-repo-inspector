import { changedFiles, resolveWorkTree } from "./git.js";
import { allowlistPolicy, unrestrictedPolicy, type AuthorizedCommand } from "./policy.js";
import {
  InspectorError,
  type CallerTrust,
  type ReviewRequest,
  type ReviewResult,
  type ValidationResult,
} from "./types.js";
import { runValidations } from "./validation.js";

/** Not derived from the repository yet — see "known limitations" in the README. */
export const DEFAULT_BASE_REF = "main";

/**
 * The single review implementation behind both adapters. It returns structured
 * data; rendering is the adapter's job, so the CLI and the MCP server cannot
 * disagree about what a review *is*, only about how it is displayed.
 */
export async function reviewRepository(request: ReviewRequest): Promise<ReviewResult> {
  const repositoryPath = resolveWorkTree(request.repositoryPath);
  const baseRef = request.baseRef ?? DEFAULT_BASE_REF;
  const commands = authorize(request.validationCommands ?? [], repositoryPath, request.callerTrust);

  const files = changedFiles(repositoryPath, baseRef);
  const results = await runValidations(commands, repositoryPath);

  return {
    schemaVersion: 1,
    repositoryPath,
    changes: { baseRef, files },
    validation: { status: summarize(results), results },
  };
}

/**
 * The one place trust becomes capability. Authorization is all-or-nothing and
 * happens before anything runs: a rejected command is a mistake in the request,
 * not an observation about the repository, and reporting it as a failed
 * validation would blur exactly the distinction the caller needs.
 */
function authorize(
  commands: string[],
  repositoryRoot: string,
  trust: CallerTrust,
): AuthorizedCommand[] {
  const policy =
    trust === "trusted-shell-caller" ? unrestrictedPolicy() : allowlistPolicy(repositoryRoot);

  return commands.map((command) => {
    const authorization = policy.authorize(command);
    if (!authorization.allowed) throw new InspectorError(authorization.reason);
    return authorization.command;
  });
}

function summarize(results: ValidationResult[]): ReviewResult["validation"]["status"] {
  if (results.length === 0) return "not-run";
  return results.every((result) => result.status === "passed") ? "passed" : "failed";
}
