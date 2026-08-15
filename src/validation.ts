import { exec } from "node:child_process";
import type { ValidationResult } from "./types.js";

export type ValidationLimits = {
  /** Wall-clock budget per command; the child is killed when it is exceeded. */
  timeoutMs: number;
  /** Hard cap on captured stdio, so a chatty command cannot exhaust memory. */
  maxBufferBytes: number;
};

export const DEFAULT_VALIDATION_LIMITS: ValidationLimits = {
  timeoutMs: 120_000,
  maxBufferBytes: 1_000_000,
};

/**
 * Runs one validation command and reports the outcome as data.
 *
 * A failing command is an *observation about the repository*, not an error in
 * this tool: it never rejects, because the review report is at its most useful
 * precisely when validation fails.
 */
export function runValidation(
  command: string,
  cwd: string,
  limits: ValidationLimits = DEFAULT_VALIDATION_LIMITS,
): Promise<ValidationResult> {
  return new Promise((resolve) => {
    exec(
      command,
      { cwd, timeout: limits.timeoutMs, maxBuffer: limits.maxBufferBytes },
      (error, stdout, stderr) => {
        const notes = error?.killed ? [`[timed out after ${limits.timeoutMs}ms]`] : [];
        resolve({
          command,
          status: error ? "failed" : "passed",
          // `code` is a string (e.g. ERR_CHILD_PROCESS_STDIO_MAXBUFFER) when the
          // child was killed rather than exited, in which case there is no code.
          exitCode: error ? (typeof error.code === "number" ? error.code : null) : 0,
          output: [stdout, stderr, ...notes].filter(Boolean).join("\n").trim(),
        });
      },
    );
  });
}

export async function runValidations(
  commands: string[],
  cwd: string,
  limits: ValidationLimits = DEFAULT_VALIDATION_LIMITS,
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  for (const command of commands) {
    results.push(await runValidation(command, cwd, limits));
  }
  return results;
}
