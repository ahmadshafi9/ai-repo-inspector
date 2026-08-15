import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { InspectorError, type ChangedFile, type ReviewResult } from "./types.js";

/**
 * Output bounds. A review is input to a reasoning step with a finite context,
 * so an unbounded file list is not more useful than a bounded one — it is just
 * unusable. Truncation is always reported in the payload, because a silently
 * partial answer is the same defect as a silently wrong one.
 */
export const DEFAULT_MAX_CHANGED_FILES = 500;
const MAX_GIT_OUTPUT_BYTES = 16 * 1024 * 1024;

function git(repositoryPath: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: repositoryPath,
    encoding: "utf8",
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
    // Capture stderr rather than letting git write to ours: on the MCP server
    // that stream belongs to the transport's peer, not to git.
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/**
 * Resolves a caller-supplied path to the root of the Git work tree containing
 * it, rejecting anything that is not one.
 *
 * Every later command runs with this as its `cwd`, which is what removes the
 * original silent-failure class: an absent or wrong path used to fall through
 * to `process.cwd()` and produce a confident report about the wrong repository.
 */
export function resolveWorkTree(repositoryPath: string): string {
  if (!repositoryPath || !existsSync(repositoryPath) || !statSync(repositoryPath).isDirectory()) {
    throw new InspectorError(`repositoryPath "${repositoryPath}" is not an existing directory.`);
  }
  try {
    return git(repositoryPath, ["rev-parse", "--show-toplevel"]);
  } catch {
    throw new InspectorError(`repositoryPath "${repositoryPath}" is not inside a Git work tree.`);
  }
}

export function changedFiles(
  repositoryPath: string,
  baseRef: string,
  maxFiles: number = DEFAULT_MAX_CHANGED_FILES,
): Omit<ReviewResult["changes"], "baseRef"> {
  const output = git(repositoryPath, ["diff", "--name-status", `${baseRef}...HEAD`]);
  const lines = output.split("\n").filter(Boolean);

  const files: ChangedFile[] = lines.slice(0, maxFiles).map((line) => {
    const [code, ...pathParts] = line.split("\t");
    const status = code === "A" ? "added" : code === "D" ? "deleted" : "modified";
    return { path: pathParts.join("\t"), status };
  });

  return { files, truncated: files.length < lines.length, totalFiles: lines.length };
}
