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

- `run` starts `bash` with the fixed argument `.auto/measure.sh` for each measurement and, when requested and present, with the fixed argument `.auto/checks.sh`. Both scripts run from the session working directory. They are supplied by the project being measured and can run commands available to the user; inspect them before use. Running these scripts is why the mod starts `bash`. It does not download programs or files. Start the Claude Code session from the repository root: the mod looks for `.auto/` only in the session working directory.
- `run` reads `.auto/config.json`, `.auto/log.jsonl`, `.auto/measure.sh`, and, when requested, `.auto/checks.sh`. It records the pending result in `.auto/.pending.json`.
- `log` reads `.auto/.pending.json`, `.auto/log.jsonl`, and the current Git commit. It appends the run to `.auto/log.jsonl` and clears `.auto/.pending.json`.
- All mod file operations use fixed paths relative to the session working directory. It writes only `.auto/.pending.json` and `.auto/log.jsonl`; it does not write build, startup, settings, or instruction files. The experiment scripts themselves may have other side effects.
- `log` invokes the local `git` program, because keeping or discarding an experiment means committing or reverting the code change it made. It runs git to stage and commit (`git add -A`, `git commit -m "ar: <desc>"`), revert (`git checkout -- .`), clean untracked files (`git clean -fd -e .auto`), and read the short commit id (`git rev-parse --short HEAD`). `<desc>` is the experiment description passed to `log`; it is the only argument that is not fixed text. These operations may discard uncommitted changes or remove untracked files outside `.auto/`; inspect the working tree before using a reverting status. `baseline` only records the result.
- The mod makes no network or HTTP requests and sends no data to a remote service. The `run` result (metrics, samples, and recent script output on failure) and the `stats`, `tail`, and `summary` results are returned to Claude Code as tool results; `tail` can include experiment descriptions and notes from `.auto/log.jsonl`. These results are visible in the conversation. `log` returns a short status string. The tool-call hooks implement the registered `run`, `log`, `stats`, `tail`, and `summary` tools and return their results in place of those tool calls. A separate Bash hook reads the command text in memory only to detect `.auto/` edits and refresh the dashboard, then returns Bash's original result through `next`. The `autoresearch-dash` `command.run` hook opens the dashboard and returns a short status message; closing the pane restores the status-line nudge.

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
