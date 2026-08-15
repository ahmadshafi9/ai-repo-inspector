import type { ReviewResult } from "./types.js";

/**
 * Pure renderer over the structured result. Adapters call it; the core does
 * not, so Markdown is never the only representation of a review.
 */
export function markdownReport(result: ReviewResult): string {
  const lines = [
    `# Review Report: ${result.repositoryPath}`,
    "",
    `## Changed files (vs ${result.changes.baseRef})`,
  ];
  for (const file of result.changes.files) {
    lines.push(`- ${file.path} (${file.status})`);
  }
  if (result.changes.truncated) {
    lines.push(`- ... ${result.changes.totalFiles - result.changes.files.length} more not shown`);
  }

  lines.push("", `## Validation: ${result.validation.status}`);
  for (const validation of result.validation.results) {
    const exit = validation.exitCode === null ? "killed" : `exit ${validation.exitCode}`;
    lines.push(
      `### ${validation.command} — ${validation.status} (${exit})`,
      "```",
      validation.output,
      "```",
    );
    if (validation.outputTruncated) {
      lines.push(`(output truncated from ${validation.outputChars} characters)`);
    }
  }
  return lines.join("\n");
}
