import { exec, execFile } from "node:child_process";
import type { AuthorizedCommand } from "./policy.js";
import type { ValidationResult } from "./types.js";

export type ValidationLimits = {
  /** Wall-clock budget per command; the child is killed when it is exceeded. */
  timeoutMs: number;
  /** Hard cap on captured stdio, so a chatty command cannot exhaust memory. */
  maxBufferBytes: number;
  /** Cap on the output kept in the result, so a chatty command cannot flood a context window. */
  maxOutputChars: number;
};

export const DEFAULT_VALIDATION_LIMITS: ValidationLimits = {
  timeoutMs: 120_000,
  maxBufferBytes: 8 * 1024 * 1024,
  maxOutputChars: 8_000,
};

/**
 * Runs one already-authorized command and reports the outcome as data.
 *
 * A failing command is an *observation about the repository*, not an error in
 * this tool: it never rejects, because the review report is at its most useful
 * precisely when validation fails.
 *
 * Whether a shell is involved is decided by `policy.ts`, never here — this
 * function cannot widen what a caller was authorized to do.
 */
export function runValidation(
  authorized: AuthorizedCommand,
  cwd: string,
  limits: ValidationLimits = DEFAULT_VALIDATION_LIMITS,
): Promise<ValidationResult> {
  return new Promise((resolve) => {
    const options = { cwd, timeout: limits.timeoutMs, maxBuffer: limits.maxBufferBytes };
    const done = (error: (Error & { code?: unknown; killed?: boolean }) | null, stdout: string, stderr: string) => {
      const notes = error?.killed ? [`[timed out after ${limits.timeoutMs}ms]`] : [];
      const output = [stdout, stderr, ...notes].filter(Boolean).join("\n").trim();
      resolve({
        command: authorized.command,
        status: error ? "failed" : "passed",
        // `code` is a string (e.g. ERR_CHILD_PROCESS_STDIO_MAXBUFFER) when the
        // child was killed rather than exited, in which case there is no code.
        exitCode: error ? (typeof error.code === "number" ? error.code : null) : 0,
        ...bound(output, limits.maxOutputChars),
      });
    };

    if (authorized.execution === "argv") {
      const [file, ...args] = authorized.argv;
      execFile(file, args, options, done);
    } else {
      exec(authorized.command, options, done);
    }
  });
}

/**
 * Keeps the head and the tail of long output: the first failure tends to be at
 * one end and the summary at the other, and dropping either loses the point.
 */
function bound(
  output: string,
  maxChars: number,
): Pick<ValidationResult, "output" | "outputTruncated" | "outputChars"> {
  if (output.length <= maxChars) {
    return { output, outputTruncated: false, outputChars: output.length };
  }
  const head = output.slice(0, Math.ceil(maxChars / 2));
  const tail = output.slice(-Math.floor(maxChars / 2));
  const omitted = output.length - maxChars;
  return {
    output: `${head}\n[... ${omitted} characters omitted ...]\n${tail}`,
    outputTruncated: true,
    outputChars: output.length,
  };
}

export async function runValidations(
  commands: AuthorizedCommand[],
  cwd: string,
  limits: ValidationLimits = DEFAULT_VALIDATION_LIMITS,
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  for (const command of commands) {
    results.push(await runValidation(command, cwd, limits));
  }
  return results;
}
