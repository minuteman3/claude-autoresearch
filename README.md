# claude-autoresearch

> **This is a Claude Code port of [pi-autoresearch](https://github.com/davebcn87/pi-autoresearch)
> by Tobi Lutke and David Cortés ([@davebcn87](https://github.com/davebcn87)).** The loop design, the session-notebook approach,
> the noise-aware confidence scoring and the dashboard are all based on that project; this repo
> adapts them to Claude Code's skills and mods. Credit for the ideas goes there.

Try an idea, measure it, keep what works, discard what doesn't, repeat — unattended.
pi-autoresearch itself builds on Andrej Karpathy's autoresearch.

## What's in it

- **Skill `autoresearch`**: the loop itself. Sets up a `.auto/` session (objective, `measure.sh`
  printing `METRIC name=<number>`, optional `checks.sh`), takes a baseline, then iterates one
  hypothesis at a time with noise-aware keep/discard decisions. Resumes from `.auto/` after a
  context reset.
- **Tools** (a Claude Code mod), listed as `mcp__autoresearch__*`:
  - `run {repeats?, checks?, timeoutSec?}`: runs `measure.sh` (median of repeats) and `checks.sh`,
    compares with the best so far: Δ%, confidence = |Δ| / noise MAD, verdict.
  - `log {status, desc, why?}`: records the run and does the git step: `keep` commits
    (`ar: <desc>`), `discard` / `checks_failed` / `crash` revert the working tree (`.auto/` kept).
  - `stats`, `tail {n?}`, `summary`.
- **Status line**: `autoresearch: best 7.6 ms (81% better than baseline) · 4/10 runs`, with
  `measuring 12s` while a run is going, and a `/autoresearch-dash for details` nudge whenever the
  dashboard isn't showing.
- **Dashboard pane** (`/autoresearch-dash`, opens automatically on the first `run`): best vs
  baseline in plain words, a row per experiment with confidence colour-coded
  (green ≥2×, yellow 1–2×, red <1× noise), a detail panel for the selected experiment, and a live
  spinner while measuring. Focus the pane, then `j`/`k` to move, `l` latest, `g` first. In
  fullscreen mode it docks beside the transcript.

## Install

```
/plugin marketplace add minuteman3/claude-autoresearch
/plugin install autoresearch@claude-autoresearch
```

Or for development: `claude --plugin-dir /path/to/claude-autoresearch`.

Then ask Claude to "autoresearch <what to optimize>".

## Limits

- `measure.sh` / `checks.sh` run with no time limit unless `run` is given `timeoutSec`.
- Mods are an early-access Claude Code feature (2.1.287+); the API may change.

## What the mod runs, reads, and writes

The mod works only in the session working directory, so start Claude Code from the repository
root. Every path and command below is fixed text in the code.

### Programs it runs

- `bash .auto/measure.sh`, once per measurement, and `bash .auto/checks.sh` when `run` is called
  with `checks: true` and the file exists. Running the project's own benchmark and check scripts
  is the purpose of the plugin, and `bash` is how they are started. The scripts are written for
  the project being measured (the skill drafts them with you) and can run any command available
  to the user, so read them before starting a session. The mod does not download programs or files.
- `git`, from `log`, because keeping an experiment means committing its code change and
  discarding one means reverting it:
  - `keep`: `git add -A`, then `git commit -F .auto/commit-msg`.
  - `discard`, `checks_failed`, `crash`: `git checkout -- .` and `git clean -fd -e .auto`. These
    discard uncommitted changes and remove untracked files outside `.auto/`, which is why the skill
    requires a clean tree on a dedicated branch.
  - every status: `git rev-parse --short HEAD` to record the commit.

  All of these act on the local repository only. The mod never runs `git push`, `fetch`, `pull`
  or `clone`, or any other command that contacts a remote.

### Files it reads and writes

- Reads `.auto/config.json`, `.auto/log.jsonl`, `.auto/.pending.json`, and checks whether
  `.auto/checks.sh` exists.
- Writes only inside `.auto/`: `.auto/.pending.json` (the last `run` result, waiting for `log`),
  `.auto/log.jsonl` (one line appended per logged run) and `.auto/commit-msg` (`ar: <description>`,
  the message for `git commit -F`). It does not write build, startup, settings or instruction
  files. The experiment scripts may of course change other files; that is the experiment.

### What it sends, and where

Nothing leaves the machine. The mod makes no network or HTTP requests, and none of the programs
above contact a remote service. Its tool results go back to Claude Code, into the conversation:
`run` returns metrics, samples and, on failure, the last 2 KB of script output; `stats`, `tail`
and `summary` return data from `.auto/log.jsonl`, including experiment descriptions and notes;
`log` returns a one-line status. The status line and dashboard show the same data locally.

### Hooks

- `session.start`: registers the five tools and the `/autoresearch-dash` command, and opens the
  dashboard if an `.auto/` session already exists; then continues through `next`.
- `tool.call` on `mcp__autoresearch__run`, `log`, `stats`, `tail` and `summary`: these are the
  mod's own tools, and the hooks implement them. Each returns its own result because no other
  tool exists to run in its place. The mod answers for no other tool.
- `tool.call` on `Bash`: runs the Bash command unchanged through `next` and returns its result
  unchanged. Afterwards, if the command text contains `.auto/`, it re-reads `.auto/` to refresh
  the dashboard. The command text is not stored or sent anywhere.
- `command.run` on `autoresearch-dash`: answers only that command, opening the dashboard and
  returning a one-line message. It does not see or change other commands.
- `ui.close`: passes every close through `next`; when the dashboard closes, it puts the
  "/autoresearch-dash for details" hint back in the status line.
- `ui.render` for the dashboard pane: draws the pane.

## Development

```
claude plugin validate .
claude plugin test .
```

## Credits

Based on [pi-autoresearch](https://github.com/davebcn87/pi-autoresearch) by
Tobi Lutke and David Cortés ([@davebcn87](https://github.com/davebcn87)), the autoresearch extension for the pi coding agent.
This plugin follows its design: the optimize-measure-keep/discard loop, a resumable session notebook,
confidence = improvement / noise with green/yellow/red thresholds, the experiment tools
(run / log), and the experiment dashboard. Differences are in packaging: a Claude Code skill
plus a mod, with git keep/revert handled by the `log` tool.

## License

MIT, see [LICENSE](LICENSE). Based on pi-autoresearch (MIT, Tobi Lutke and David Cortés); its notice is in [NOTICE](NOTICE).
