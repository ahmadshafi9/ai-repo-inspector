import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Creates a throwaway Git repository with a `main` base commit and a `feature`
 * branch that modifies one file and adds another. Returns its path; the caller
 * is responsible for `removeFixtureRepo`.
 */
export function createFixtureRepo(): string {
  const directory = mkdtempSync(join(tmpdir(), "inspector-fixture-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: directory, stdio: "pipe" });

  git("init", "-b", "main");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "user.name", "Fixture");
  writeFileSync(join(directory, "base.txt"), "base\n");
  git("add", ".");
  git("commit", "-m", "base");

  git("checkout", "-b", "feature");
  writeFileSync(join(directory, "base.txt"), "changed\n");
  writeFileSync(join(directory, "added.txt"), "new\n");
  git("add", ".");
  git("commit", "-m", "feature");

  return directory;
}

export function removeFixtureRepo(directory: string): void {
  rmSync(directory, { recursive: true, force: true });
}
