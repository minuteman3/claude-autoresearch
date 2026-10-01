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
  - `run {repeats?, checks?, dir?}`: runs `measure.sh` (median of repeats) and `checks.sh`,
    compares with the best so far: Δ%, confidence = |Δ| / noise MAD, verdict.
  - `log {status, desc, why?, dir?}`: records the run and does the git step: `keep` commits
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
