import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runValidation, runValidations } from "../src/validation.js";

describe("runValidation", () => {
  let cwd: string;
  beforeAll(() => {
    cwd = mkdtempSync(join(tmpdir(), "inspector-validation-"));
  });
  afterAll(() => rmSync(cwd, { recursive: true, force: true }));

  it("reports a passing command", async () => {
    const result = await runValidation("echo hello", cwd);

    expect(result).toMatchObject({ status: "passed", exitCode: 0 });
    expect(result.output).toContain("hello");
  });

  it("reports a failing command as data instead of rejecting", async () => {
    const result = await runValidation("exit 1", cwd);

    expect(result).toMatchObject({ command: "exit 1", status: "failed", exitCode: 1 });
  });

  it("captures both stdout and stderr of a failing command", async () => {
    const result = await runValidation("echo out; echo err 1>&2; exit 3", cwd);

    expect(result.exitCode).toBe(3);
    expect(result.output).toContain("out");
    expect(result.output).toContain("err");
  });

  it("kills a command that exceeds its time budget and says so", async () => {
    const result = await runValidation("sleep 5", cwd, {
      timeoutMs: 150,
      maxBufferBytes: 1000,
    });

    expect(result).toMatchObject({ status: "failed", exitCode: null });
    expect(result.output).toContain("timed out");
  });

  it("keeps running later commands after an earlier one fails", async () => {
    const results = await runValidations(["exit 1", "echo second"], cwd);

    expect(results.map((result) => result.status)).toEqual(["failed", "passed"]);
  });
});
