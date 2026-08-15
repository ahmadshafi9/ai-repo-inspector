import { describe, expect, it } from "vitest";
import { markdownReport } from "../src/report.js";
import type { ReviewResult } from "../src/types.js";

function result(overrides: Partial<ReviewResult> = {}): ReviewResult {
  return {
    schemaVersion: 1,
    repositoryPath: "/work/sample",
    changes: {
      baseRef: "main",
      files: [{ path: "src/index.ts", status: "modified" }],
      truncated: false,
      totalFiles: 1,
    },
    validation: {
      status: "passed",
      results: [{ command: "npm test", status: "passed", exitCode: 0, output: "ok", outputTruncated: false, outputChars: 2 }],
    },
    ...overrides,
  };
}

describe("markdownReport", () => {
  it("lists changed files and validation output", () => {
    const report = markdownReport(result());

    expect(report).toContain("# Review Report: /work/sample");
    expect(report).toContain("## Changed files (vs main)");
    expect(report).toContain("- src/index.ts (modified)");
    expect(report).toContain("### npm test — passed (exit 0)");
    expect(report).toContain("ok");
  });

  it("states that validation failed rather than only showing its output", () => {
    const report = markdownReport(
      result({
        validation: {
          status: "failed",
          results: [{ command: "npm test", status: "failed", exitCode: 1, output: "boom", outputTruncated: false, outputChars: 4 }],
        },
      }),
    );

    expect(report).toContain("## Validation: failed");
    expect(report).toContain("### npm test — failed (exit 1)");
  });

  it("says so when the payload is partial", () => {
    const report = markdownReport(
      result({
        changes: {
          baseRef: "main",
          files: [{ path: "a.ts", status: "modified" }],
          truncated: true,
          totalFiles: 501,
        },
        validation: {
          status: "passed",
          results: [
            {
              command: "npm test",
              status: "passed",
              exitCode: 0,
              output: "start ... end",
              outputTruncated: true,
              outputChars: 90_000,
            },
          ],
        },
      }),
    );

    expect(report).toContain("... 500 more not shown");
    expect(report).toContain("(output truncated from 90000 characters)");
  });

  it("reports a killed command without inventing an exit code", () => {
    const report = markdownReport(
      result({
        validation: {
          status: "failed",
          results: [{ command: "sleep 99", status: "failed", exitCode: null, output: "", outputTruncated: false, outputChars: 0 }],
        },
      }),
    );

    expect(report).toContain("### sleep 99 — failed (killed)");
  });
});
