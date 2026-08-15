import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { InspectorError, type ChangedFile } from "./types.js";

function git(repositoryPath: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: repositoryPath,
    encoding: "utf8",
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

export function changedFiles(repositoryPath: string, baseRef: string): ChangedFile[] {
  const output = git(repositoryPath, ["diff", "--name-status", `${baseRef}...HEAD`]);

  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [code, ...pathParts] = line.split("\t");
      const status = code === "A" ? "added" : code === "D" ? "deleted" : "modified";
      return { path: pathParts.join("\t"), status };
    });
}
