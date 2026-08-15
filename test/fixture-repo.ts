import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type FixtureOptions = {
  /** Written to `.inspector.json`; omit to leave the repository without a policy. */
  allowedValidationCommands?: string[];
};

/**
 * Creates a throwaway Git repository with a `main` base commit and a `feature`
 * branch that modifies one file and adds another. Returns its path; the caller
 * is responsible for `removeFixtureRepo`.
 */
export function createFixtureRepo(options: FixtureOptions = {}): string {
  // Real path, because git reports the resolved one and /tmp is a symlink on macOS.
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "inspector-fixture-")));
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

  if (options.allowedValidationCommands) {
    writeFileSync(
      join(directory, ".inspector.json"),
      JSON.stringify({ allowedValidationCommands: options.allowedValidationCommands }),
    );
  }

  return directory;
}

export function removeFixtureRepo(directory: string): void {
  rmSync(directory, { recursive: true, force: true });
}
