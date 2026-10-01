---
name: autoresearch
description: Autonomous optimize-measure-keep/discard loop against a single numeric metric (test runtime, bundle size, latency, loss, binary size, print time…). Use when the user says "autoresearch", "optimize X overnight", "keep trying ideas until Y improves", "run experiments on", or wants an unattended improvement loop. Also resumes an existing session when a .auto/ folder exists.
---

# Autoresearch

Try an idea, measure it, keep what works, discard what doesn't, repeat. Inspired by
pi-autoresearch (davebcn87) and Karpathy's autoresearch. Git is the memory; `.auto/` is
the notebook, so a fresh context can always resume.

## Session files (`.auto/` at repo root, gitignored except where noted)

| File | Purpose |
|---|---|
| `.auto/prompt.md` | Objective, metric + direction, scope (files allowed to change), constraints, ideas tried/untried. The source of truth after a context reset. |
| `.auto/measure.sh` | Runs the benchmark; prints one or more `METRIC name=<number>` lines. Exit ≠ 0 means crash. |
| `.auto/checks.sh` | Optional correctness gate (tests/lint/types). Must pass for a *keep*. |
| `.auto/log.jsonl` | Append-only; one JSON object per run. |
| `.auto/config.json` | `{"metric":"name","direction":"min|max","maxIterations":N,"repeats":R}` |

Use the **plugin's tools** for the mechanical parts: `mcp__autoresearch__run`,
`…__log`, `…__stats`, `…__tail`, `…__summary`. `log` also does the git step (keep → commit
all changes as `ar: <desc>`; discard/checks_failed/crash → revert tree, `.auto` kept). The
plugin also shows a status-line summary and a live experiment dashboard (`/autoresearch-dash`).

## Setup (once)

1. If `.auto/prompt.md` exists → skip to **Resume**.
2. Ask only what can't be inferred: goal metric & direction, how to measure, what files are
   in scope, what must not break, iteration/time budget. Propose defaults from the repo.
3. Require a clean git tree. Create branch `autoresearch/<slug>-<date>`.
4. Write `.auto/*`. Make `measure.sh` fast (seconds–minutes), deterministic where possible,
   and print `METRIC`. Add `.auto/` to `.git/info/exclude`.
5. Baseline: `run {repeats: 3}` then `log {status: baseline, desc: baseline}`.

## Loop (each iteration)

1. Read `.auto/prompt.md` tried-ideas list and `tail` so you don't repeat an idea.
2. Pick **one** hypothesis. Make a small, focused edit inside scope only.
3. `run` → metric(s) + wall time. If crash: fix once if trivially yours, else discard.
4. If metric improved, run `.auto/checks.sh` (`run {checks: true}`).
5. `run`'s `stats` gives confidence = |Δ vs best| / MAD of noise. **<1× is noise** → rerun
   (`--repeats 3`) before believing it; ≥2× is real.
6. Decide:
   - **keep**: improved, checks pass, confidence ≥ ~1.5 → `log {status: keep, desc, why}`
     (commits, logs HEAD hash).
   - **discard**: `log {status: discard, desc, why}` (reverts the tree).
   - **checks_failed** / **crash**: `log` with that status (reverts the tree).
7. Append the idea + outcome in one line to `prompt.md` "Tried". Every ~10 runs, rewrite the
   "Untried ideas" list, and note learnings (what kinds of change help).
8. Continue. Do not stop to ask permission between iterations. Stop only at `maxIterations`,
   budget, goal hit, user interrupt, or ~5 consecutive discards with no fresh ideas (then
   report and ask for direction).

For long unattended runs, suggest `/loop` (self-paced) with prompt "continue autoresearch"
so compaction/restarts resume cleanly.

## Resume

Read `.auto/prompt.md`, `tail {n: 20}`, `git log --oneline -20`, confirm tree clean
(revert any half-done experiment), then continue the loop.

## Rules

- One variable per experiment; never batch unrelated ideas into one keep.
- Never edit `measure.sh`/`checks.sh` to make numbers look better. Changing the benchmark
  requires a new baseline and a note in prompt.md — tell the user.
- Never weaken or delete tests to pass checks.
- Stay within scope files; no dependency upgrades unless in scope.
- Beware wins that are really noise, caching, or measurement artefacts — rerun surprising results.

## Finalize (when user asks, or at end)

`summary` → table of keeps with Δ each. Offer to squash kept commits into logical
groups on a clean branch off the merge-base, each independently reviewable, with the
measured improvement in the commit message. Report baseline → best, run count, and the
top learnings.
