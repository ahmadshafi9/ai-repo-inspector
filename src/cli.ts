#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { reviewRepository } from "./core.js";
import { markdownReport } from "./report.js";

/**
 * Development / debugging wrapper over the same core the MCP server uses. It is
 * not the production interface (see the README) and is not hardened.
 */

const FORMATS = ["markdown", "json"] as const;
type Format = (typeof FORMATS)[number];

type Args = {
  command: string;
  repositoryPath?: string;
  baseRef?: string;
  format: string;
  validations: string[];
};

function parseArgs(argv: string[]): Args {
  const args: Args = { command: argv[0] ?? "", format: "markdown", validations: [] };
  for (let index = 1; index < argv.length; index++) {
    const token = argv[index];
    if (token === "--repo") {
      args.repositoryPath = argv[++index]?.split(" ")[0];
    } else if (token === "--base-ref") {
      args.baseRef = argv[++index];
    } else if (token === "--format") {
      args.format = argv[++index] ?? "";
    } else if (token === "--validate") {
      args.validations.push(argv[++index]);
    }
  }
  return args;
}

function isFormat(value: string | undefined): value is Format {
  return FORMATS.includes(value as Format);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const format = args.format;
  if (args.command !== "review" || !args.repositoryPath || !isFormat(format)) {
    console.error(
      `Usage: inspector review --repo <path> [--base-ref <ref>] [--format ${FORMATS.join("|")}] [--validate <command>]`,
    );
    process.exitCode = 1;
    return;
  }

  const result = await reviewRepository({
    repositoryPath: args.repositoryPath,
    // Whoever can run this binary already has a shell, so the allowlist would
    // protect nothing. The MCP server, whose caller is a model, does not.
    callerTrust: "trusted-shell-caller",
    baseRef: args.baseRef,
    validationCommands: args.validations,
  });

  const [file, body] =
    format === "json"
      ? ["review-report.json", JSON.stringify(result, null, 2)]
      : ["review-report.md", markdownReport(result)];
  writeFileSync(file, body, "utf8");
  console.log(`Review report written to ${file}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exitCode = 1;
});
