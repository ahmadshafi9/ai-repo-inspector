import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuthorizedCommand } from "../src/policy.js";
import { runValidation, runValidations } from "../src/validation.js";

const shell = (command: string): AuthorizedCommand => ({ command, execution: "shell" });
const argv = (...parts: string[]): AuthorizedCommand => ({
  command: parts.join(" "),
  execution: "argv",
  argv: parts,
});

describe("runValidation", () => {
  let cwd: string;
  beforeAll(() => {
    cwd = mkdtempSync(join(tmpdir(), "inspector-validation-"));
  });
  afterAll(() => rmSync(cwd, { recursive: true, force: true }));

  it("reports a passing command", async () => {
    const result = await runValidation(shell("echo hello"), cwd);

    expect(result).toMatchObject({ status: "passed", exitCode: 0 });
    expect(result.output).toContain("hello");
  });

  it("reports a failing command as data instead of rejecting", async () => {
    const result = await runValidation(shell("exit 1"), cwd);

    expect(result).toMatchObject({ command: "exit 1", status: "failed", exitCode: 1 });
  });

  it("captures both stdout and stderr of a failing command", async () => {
    const result = await runValidation(shell("echo out; echo err 1>&2; exit 3"), cwd);

    expect(result.exitCode).toBe(3);
    expect(result.output).toContain("out");
    expect(result.output).toContain("err");
  });

  it("kills a command that exceeds its time budget and says so", async () => {
    const result = await runValidation(shell("sleep 5"), cwd, {
      timeoutMs: 150,
      maxBufferBytes: 1000,
    });

    expect(result).toMatchObject({ status: "failed", exitCode: null });
    expect(result.output).toContain("timed out");
  });

  it("runs an argv command without a shell, so metacharacters are inert", async () => {
    const result = await runValidation(argv("echo", "a; touch pwned.txt"), cwd);

    expect(result.output).toBe("a; touch pwned.txt");
    expect(existsSync(join(cwd, "pwned.txt"))).toBe(false);
  });

  it("keeps running later commands after an earlier one fails", async () => {
    const results = await runValidations([shell("exit 1"), shell("echo second")], cwd);

    expect(results.map((result) => result.status)).toEqual(["failed", "passed"]);
  });
});
