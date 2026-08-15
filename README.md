# Repository Inspector

This is a small TypeScript developer tool that inspects changes in a Git
repository, runs optional validation commands, and produces a Markdown report.
It can be used from a command line or exposed to AI clients through MCP.

## Your task

Investigate the repository and improve it as you judge best. The starter works
for a narrow happy path, but production use may expose correctness, safety,
reliability, contract, output, documentation, or testing weaknesses.

You are not expected to finish everything. We care about how you investigate,
prioritize, implement, verify, and explain a meaningful scope.

## Product decision

This tool may be used directly by developers and by AI coding agents. Decide
whether its production interface should be **CLI-first**, **MCP-first**, or
**hybrid**. Implement improvements consistent with your decision.

There is no preferred label. Explain:

- The primary user and execution environment you assumed.
- The trust boundary and allowed capabilities.
- Reliability, discoverability, latency/context, and output-size tradeoffs.
- How the interfaces you continue to advertise stay behaviorally consistent.
- What evidence would change your decision.

## Time and rules

- Maximum **90 focused minutes** within 48 hours of receiving the invitation.
- Use AI coding tools freely. Verify their work and document at least one
  suggestion you corrected or rejected.
- Work in your own repository created from this template.
- Commit as you work and complete `SUBMISSION.md` in your final commit.
- Completion is not required. Accurate scope and verification matter more than
  a large diff.

## Setup

```bash
npm install
npm run typecheck
npm test
```

## MCP (the production interface)

Start the stdio server with:

```bash
npm run mcp-server
```

It exposes one tool, `review_repository`:

| input | required | meaning |
| --- | --- | --- |
| `repo_path` | yes | Path inside the Git work tree to inspect. |
| `base_ref` | no | Ref to diff `HEAD` against. Defaults to `main`. |
| `validation_commands` | no | Commands to run in the repository. Allowlisted only — see below. |

The tool returns a structured `ReviewResult` as `structuredContent`, validated
against the advertised `outputSchema`, plus a Markdown rendering of the same
information as text.

### Validation policy

The MCP caller is a model that may have read attacker-influenced content from
the repository it is inspecting, so it never reaches a shell. Validation
commands run via `execFile` as argv vectors, and each must match an entry of
`.inspector.json`, committed in the repository being inspected, **exactly**:

```json
{ "allowedValidationCommands": ["npm test", "npm run typecheck"] }
```

If that file is absent, empty or malformed, every validation command is
rejected with an error naming the file and the key it needs. There is no
permissive fallback, and no prefix or argument-appending match: `npm test
--silent` is a different command from `npm test`.

## CLI (development only)

The CLI is a debugging wrapper over the same core. It is **not** the production
interface: it is not hardened and its flags carry no stability guarantee.

```bash
npm run inspector -- review --repo ./path/to/repo --format markdown
npm run inspector -- review --repo ./path/to/repo --validate "npm test"
```

The report is written to `review-report.md`, or `review-report.json` for
`--format json`. Its caller already has a shell, so `--validate` accepts
arbitrary commands and ignores `.inspector.json`. That asymmetry is deliberate
and lives in one required field, `ReviewRequest.callerTrust`.

## Project layout

```text
src/core.ts         shared review orchestration, returns a ReviewResult
src/types.ts        the result contract, as Zod schemas
src/policy.ts       which validation commands a caller may run
src/git.ts          Git inspection
src/validation.ts   validation execution
src/report.ts       Markdown rendering of a ReviewResult
src/mcp-tool.ts     MCP tool contract (production adapter)
src/mcp-server.ts   stdio transport wiring
src/cli.ts          command-line adapter (development only)
test/               tests
```

When finished, submit via **Security → Report a vulnerability** on this
repo — see `SECURITY.md` for exactly what to include. Do not reply by email;
that submission channel is not monitored.