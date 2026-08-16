# Submission

## What did you investigate first, and why?

I ran the gates before reading any source: `npm install`, `npm run typecheck`,
`npm test`. All green — one test, covering `markdownReport` only. That told me
where to look. Nothing covered `git.ts`, `validation.ts`, `cli.ts`, or
`mcp-server.ts` — i.e. nothing covered any code touching the filesystem, the
shell, or the tool contract. A green build over untested I/O boundaries is where
the defects were going to be.

So I built throwaway Git fixtures (a feature branch with a modification and an
addition, a true rename, a `master`-default repo, a path containing a space, a
non-Git directory) and drove both adapters against them rather than reading for
bugs. For MCP I wrote a small stdio JSON-RPC client, because "the code looks
right" is not evidence about a protocol server.

The first call I made through that client returned:

```
# Review Report: undefined
```

with no `isError` set. That reordered everything else.

## What did you choose to implement or fix?

Seven commits, each atomic, each independently green on typecheck + tests.

1. **`fix(mcp): correct input contract`** — the schema advertised `repo_path`;
   the handler read `input.repoPath`. Always `undefined`, so `execFileSync`
   inherited `process.cwd()` and inspected the server's own directory, returning
   a well-formed, successful, empty report. An agent asking "what changed?" was
   told "nothing". I also removed the `async (input: any)` that let this
   typecheck in the first place, and added a test asserting the advertised
   schema keys match what the handler consumes.

2. **`fix(validation): treat failure as data`** — `runValidation` rejected on
   non-zero exit, so `--validate "npm test"` only produced a report when the
   tests passed, which is the least interesting case. Non-zero exit is now
   `status: "failed"` with captured output. `ValidationResult.status` had a
   `"failed"` variant that was unreachable.

3. **`refactor(core): return structured result`** — `reviewRepository` returns a
   typed `ReviewResult`; Markdown rendering moved to the adapter edge. This is
   the change the interface decision actually rests on. It also killed a silent
   lie: `--format json` was parsed, plumbed through, and then ignored.

4. **`feat(security): deny-by-default validation allowlist`** — `exec` with a
   full shell replaced by `execFile` with argv vectors. Commands must match an
   entry in `.inspector.json`, committed in the repository under inspection,
   exactly. Absent, empty, or malformed policy allows nothing; there is no
   permissive fallback. The repository path is validated as a real Git work tree
   before anything runs, which closes the entire silent-wrong-target class.

5. **`feat(core): bound output`** — 500 changed files, 8000 characters per
   validation command, 120s per command. When a bound bites the payload says so
   (`changes.truncated` with `totalFiles`, `outputTruncated` with `outputChars`).
   Silent truncation is the same bug class as #1.

6. **`test: scope test discovery to source files`** — CI runs typecheck → build →
   test, and the build emitted compiled copies of the suite into `dist/test/`,
   which vitest then discovered alongside the originals. Every test ran twice.

7. **`docs: scope the allowlist's threat model precisely`** — see the blocker
   section below.

## What did you intentionally not do?

I deliberately left five known defects unfixed and documented them in the README
rather than half-fixing them. The instruction that scope accuracy matters more
than diff size seemed worth taking literally.

- CLI `--repo` truncates its argument at the first space, silently selecting the
  wrong repository.
- `base_ref` defaults to `main` with no detection of the actual default branch.
- Renamed files parse as a single fused path and report as `modified`.
- Untracked files are never reported despite the `"untracked"` status variant.
- Errors other than the deliberate ones surface as raw Node exceptions.

I also collected no diff content — only file names, as the starter did.

The CLI fixes are last on purpose: under the interface decision below, the CLI is
no longer a production surface, so hardening it would be effort spent against my
own stated priority.

## Interface decision

- **Decision:** MCP-first.

- **Primary user and execution environment:** an AI coding agent invoking the
  tool over stdio, inside a developer workstation or a CI container. I reached
  this from the artifact rather than from a trend: the tool has no interactive
  affordances, no watch mode, and no TTY output worth reading. Its output is
  input to a reasoning step. "AI agents are the future" would be an
  unfalsifiable justification, so I am not resting on it.

- **Trust boundary and allowed capabilities:** the MCP caller is *not* trusted.
  It is a model that may have read attacker-influenced content from the very
  repository it is asking about. It therefore never reaches a shell: commands
  are argv vectors, matched exactly against a repository-owned allowlist, with
  wall-clock and output bounds. The CLI caller *is* trusted — it already has a
  shell, so withholding one buys nothing, and `--validate` stays arbitrary. The
  asymmetry is deliberate and lives in one required field,
  `ReviewRequest.callerTrust`, so it cannot be set accidentally.

- **Reliability, discoverability, latency/context, and output tradeoffs:** the
  typed schema is self-documenting, which is most of the discoverability
  argument for MCP. Structured output costs some human readability and buys
  machine-checkable results plus a bounded context budget — the real latency
  concern here is not milliseconds but tokens, since an unbounded diff is a
  context-window denial of service. I return Markdown as `content` alongside
  `structuredContent`, which is what the spec recommends but roughly doubles
  tokens; a summary-only text field would be cheaper and less compliant, and I
  would revisit this with usage data.

- **How supported interfaces remain consistent:** by not advertising two. The
  CLI is demoted to a documented development wrapper with no hardening or
  stability guarantee, stated in the README. Both adapters call the same
  `reviewRepository` and render the same `ReviewResult`, so consistency is
  structural rather than maintained by discipline.

- **Evidence that would change this decision:** if most invocations arrived with
  `CI=true` and no MCP session — that is, CI pipelines and Git hooks rather than
  agents — then the exit-code contract and file output become the primary
  interface and the structured payload is overhead. I would flip to CLI-first
  and drop the shell passthrough entirely rather than maintain both.

## How did you use an AI coding agent?

Heavily, across several tools, with the roles kept deliberately separate.

**Orientation.** I started by handing Claude the README and asking it to tell me
exactly what I had and what I was being asked to do, before forming my own view.
The brief covers a lot of ground and I wanted the scope mapped before I started
making decisions inside it.

**Investigation.** Rather than reading for bugs, I had Claude build throwaway Git
fixtures and a small stdio JSON-RPC client, then drive both adapters against
them. That produced the ten characterised findings and, on the very first MCP
call, the `# Review Report: undefined` result that reordered my priorities.

**Deciding.** This is where I overrode it — see the next section. Once I had
settled on MCP-first I worked out the product decisions and the implementation
order myself, deliberately in small steps so that each one could be verified
before the next began.

**Implementing.** I handed the scoped plan to Cursor to write the code, holding
back five of the ten findings to keep the diff small.

**Reviewing.** Two independent passes before anything was committed: a Cursor
agent reviewing the code, running in parallel while I worked, and a separate
review back through Claude. Running the review in a different context from the
one that wrote the code is what caught both of the problems below — neither was
visible to the agent that produced them.

The pattern I would take from this: the useful separation is not human-versus-AI,
it is author-versus-reviewer. The code came back good. The *claims about* the
code did not, and only a reviewer without the author's context noticed.

## Where did you check, correct, or reject an AI suggestion? (required)

**Rejected — the architectural recommendation itself.** While brainstorming the
interface question, Claude recommended a hybrid: keep both CLI and MCP as
production surfaces, distinguished by trust level. The reasoning was sound in the
abstract, and I pushed back on it.

Two reasons. First, the practical one: in the time available I could not harden
two trust boundaries to a standard where I would actually use either. Hybrid was
the option most likely to leave me with two half-finished interfaces, and a
half-hardened security boundary is worse than an absent one because it invites
trust it has not earned. Second, on reflection hybrid is the easiest label to
choose and the hardest to defend — without a real capability distinction in the
code it reads as declining to decide.

I went back and forth on this for a while before committing to MCP-first, and the
argument I eventually landed on is the one in the interface section: it follows
from the artifact having no interactive affordances, not from a prediction about
agents. Claude's counter-argument — that "AI agents are the future" is
unfalsifiable and a reviewer would treat it as such — I accepted, and it changed
how I justified the decision rather than what I decided.

Notably, MCP-first *subsumed* the good part of the hybrid proposal: the CLI still
exists and still has a different trust level, it just is not advertised as
production. So the disagreement was about what to promise, not what to build.

**Corrected — a fix that was never run.** The agent identified the duplicate
test-run defect and proposed `"test": "vitest run test"`, calling it a "one-word
fix". I applied it and measured: still 86 tests from 43 files. Trailing
arguments to `vitest run` are filename *substring* filters, not path
restrictions, so `test` matches `dist/test/foo.test.js` exactly as happily as
`test/foo.test.ts`. The real fix was a `vitest.config.ts` with explicit
`include`/`exclude` (commit 6). The tell was a confidence marker attached to a
change with no evidence it had been executed.

**Rejected — an overclaimed security boundary.** The agent documented the
allowlist as: "the MCP caller is a model that may have read attacker-influenced
content from the repository it is inspecting, so it never reaches a shell." The
mechanism is sound; the framing is not. `.inspector.json` is read *from the
repository being inspected* — the same repository the sentence calls
attacker-influenced. The file defining the policy is controlled by the party the
policy constrains. Verified rather than argued:

```json
{ "allowedValidationCommands":
  ["node -e require('fs').writeFileSync('/tmp/work/HOSTILE_REPO.txt','x')"] }
```

executes, no shell needed, and reports `passed`.

I rejected the claim rather than the code, for reasons in the next section.

**Checked — claims that held.** The agent asserted every commit was
independently green. I checked out each SHA and re-ran both gates from a clean
`dist/`: 5 → 11 → 16 → 38 → 43 → 43 tests, monotonic, no regressions. Accurate.

The pattern across all four: the AI's *code* survived adversarial testing; its
*recommendations* and its *claims about its code* did not. I would generalise
that as — treat AI-authored code as a draft to test, and AI-authored claims as
assertions to falsify. Every real failure here was in the second category.

## Commands used to verify the result, with outcomes

```
npm run typecheck                → exit 0
npm run build                    → exit 0
npm test                         → 43 passed (6 files); was 86 before commit 6
```

Per-commit, each SHA checked out with `dist/` cleared:

```
717c3c6 typecheck=OK   5 passed      e4a1fa8 typecheck=OK  38 passed
ef77814 typecheck=OK  11 passed      275a22b typecheck=OK  43 passed
343735f typecheck=OK  16 passed      3f2bb0d typecheck=OK  43 passed
```

Behavioural verification over real stdio JSON-RPC, not by reading code:

| Check | Before | After |
| --- | --- | --- |
| `repo_path` honoured | `# Review Report: undefined`, `isError:false` | correct path, file list, `structuredContent` |
| shell injection | file written outside repo, `isError:false` | `isError:true`, no file created |
| failing validation | stack trace, no report written | report written, `## Validation: failed` |
| non-Git path | silently used `process.cwd()` | `isError:true`, "not inside a Git work tree" |
| hostile policy file | — | executes; documented, not fixed |

CI: eight workflow runs on `main`, one per commit, all green.

## A blocker you hit and how you approached it

The allowlist looked finished, and then I could not decide whether it worked.

The policy file lives in the repository being inspected — which the threat model
describes as attacker-influenced. So a malicious repository writes its own
allowlist. I confirmed it: arbitrary execution, `passed`, no shell involved.

My first instinct was to tighten the allowlist — signatures, a policy outside the
repo, a stricter argv grammar. Each of those failed the same test, which is what
made it a blocker rather than a bug. Running a repository's validation commands
*at all* means executing code that repository controls, because `npm test` runs
its own `package.json` scripts, which are arbitrary by design. There is no
allowlist strict enough to permit `npm test` and forbid what `npm test` can do.
The only real mitigation is sandboxed execution — no network, scoped filesystem
— which I could not do responsibly in the time available.

So I stopped trying to fix it and fixed the claim instead. The README now
separates the threat that is defended (an injected model inventing commands —
real, distinct, and genuinely closed) from the one that is not (a hostile
repository), states the operating rule plainly — point this at repositories you
would be willing to run `npm test` in — and shows the working exploit.

Shipping the stronger-sounding sentence would have been the actual
vulnerability: a reviewer trusting a boundary that does not exist is worse off
than one who knows where it ends.

## Known limitations and the next three things you would do

Limitations are listed in the README and in "What did you intentionally not do?"
above. In priority order, next:

1. **Sandbox validation execution** — run commands in a container with no
   network and a read-only mount outside the work tree. This is the only thing
   that converts the allowlist from a guard against a confused model into a
   guard against a hostile repository, and it is the largest real gap.
2. **Resolve the base ref properly** — detect the default branch via
   `origin/HEAD`, fall back sensibly on detached HEAD, and return a clear error
   naming the refs tried. Today a `master` repository simply fails.
3. **Fix Git parsing and error surfacing together** — rename records, untracked
   files, and wrapping `execFileSync` failures in `InspectorError` so the MCP
   caller gets an actionable message rather than a Node exception dump.

After those, diff content with per-file bounds — file names alone limit how much
an agent can conclude without a second round trip.

## Approximate focused-work time

- Start: 15 Aug 2026, ~23:45 IST
- Finish: 16 Aug 2026, ~02:10 IST

Approximately 2 hours 30 minutes of focused work, which is over the 90-minute
maximum. Reporting it accurately rather than trimming it to fit.

Roughly where it went: orientation and investigation (building fixtures and the
stdio probe, characterising the ten findings), then an extended back-and-forth on
the interface decision before any code was written, then implementation and two
review passes. The investigation and the decision took longer than the
implementation did. If I were repeating this against a hard 90 minutes, I would
cut the scope further — probably to the first three commits — rather than
compress the investigation, since the investigation is what made the scope
defensible.
