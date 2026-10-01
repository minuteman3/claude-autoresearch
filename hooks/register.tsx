import { atom, read, update } from 'claude-code'
import type { Register, EngineInterface } from 'claude-code'

import {
  EMPTY, STATUSES, confColor, confWord, fmt, headline, median, parseConfig, parseLog, parseMetrics,
  primary, progress, snapshot, sparkline, stats, statusLine, summary, tail,
} from './lib'
import type { Entry } from './lib'
import type { Run } from '../types'

const PANE = 'autoresearch'
const TITLE = 'Autoresearch'
const snap = atom({ plugin: 'autoresearch', key: 'snap' } as const, EMPTY)
const selected = atom({ plugin: 'autoresearch', key: 'selected' } as const, null)
const running = atom({ plugin: 'autoresearch', key: 'running' } as const, null)
const now = atom({ plugin: 'autoresearch', key: 'now' } as const, 0)

const LOG = '.auto/log.jsonl', PENDING = '.auto/.pending.json', CFG = '.auto/config.json'

const STATUS: Record<string, { color: string; label: string }> = {
  baseline: { color: 'cyan', label: 'baseline' },
  keep: { color: 'green', label: 'kept' },
  discard: { color: 'gray', label: 'discarded' },
  checks_failed: { color: 'yellow', label: 'checks failed' },
  crash: { color: 'red', label: 'crashed' },
}
const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'

const readOr = async ($: EngineInterface, p: string) =>
  (await $.fs.exists(p)) ? ((await $.fs.read(p)) as string) : null

async function load($: EngineInterface) {
  const cfg = parseConfig(await readOr($, CFG))
  return { cfg, es: parseLog((await readOr($, LOG)) ?? '') }
}

async function refresh($: EngineInterface) {
  let next = EMPTY
  try {
    if ((await $.fs.exists(LOG)) || (await $.fs.exists(CFG))) {
      const { cfg, es } = await load($)
      next = snapshot(cfg, es)
    }
  } catch {
    return // half-written log line mid-append: keep the last good view
  }
  await update($, snap, () => next)
  await showStatus($)
}

// Best effort: a status-line hiccup must never fail a tool call.
async function showStatus($: EngineInterface, closing = false) {
  try {
    const s = await read($, snap)
    const live = await read($, running)
    const shown = !closing && (await $.ui.panes()).some(p => p.id === PANE && p.isShown)
    await $.ui.status(statusLine(s, live ? Math.max(0, (await read($, now)) - live.startedAt) : null, shown))
  } catch {}
}

const json = (v: unknown) => JSON.stringify(v, null, 1)
// Streams the script so a benchmark may run as long as it needs (time waiting on the process
// is not charged to the hook's budget); `timeoutMs` kills it, reading as exit 124 like timeout(1).
async function sh($: EngineInterface, it: AsyncIterator<any>, timeoutMs?: number) {
  let stdout = '', stderr = '', timedOut = false
  const timer = timeoutMs ? $.clock.after(timeoutMs, () => { timedOut = true; void it.return?.(undefined as never) }) : undefined
  try {
    for (;;) {
      const r = await it.next()
      if (r.done) {
        const code = timedOut ? 124 : (r.value?.code ?? 1)
        return { exitCode: code, stdout, stderr: timedOut ? stderr + `\n[timed out after ${timeoutMs! / 1000}s]` : stderr }
      }
      if (r.value.stream === 'stdout') stdout += r.value.text
      else stderr += r.value.text
      const last = r.value.text.trimEnd().split('\n').pop()
      if (last) await update($, running, cur => (cur ? { ...cur, last: last.slice(0, 200) } : cur))
    }
  } finally {
    timer?.cancel()
  }
}
const signed = (p: number) => `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`
const ago = (ms: number) => (ms < 60_000 ? `${Math.floor(ms / 1000)}s` : `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'autoresearch-dash', description: 'Open the autoresearch dashboard' })
    await $.tool.register({
      name: 'run',
      description: 'Autoresearch: run .auto/measure.sh (median of `repeats` runs), optionally .auto/checks.sh, and compare to the best so far. Saves the result as pending for `log`. Returns metrics, samples, seconds, checks_ok and stats (improves, delta_pct, confidence, verdict).',
      inputSchema: { type: 'object', properties: {
        repeats: { type: 'integer', minimum: 1, description: 'Defaults to config.repeats' },
        checks: { type: 'boolean', description: 'Also run .auto/checks.sh' },
        timeoutSec: { type: 'integer', minimum: 1, description: 'Kill measure.sh/checks.sh after this many seconds (default: no limit)' },
      } },
    })
    await $.tool.register({
      name: 'log',
      description: 'Autoresearch: record the pending run in .auto/log.jsonl AND do the git step. keep: commits all changes ("ar: <desc>") and logs the new HEAD. discard / checks_failed / crash: reverts the working tree (git checkout -- . && git clean -fd, .auto kept). baseline: logs only.',
      inputSchema: { type: 'object', required: ['status', 'desc'], properties: {
        status: { enum: [...STATUSES] }, desc: { type: 'string' }, why: { type: 'string' },
      } },
    })
    await $.tool.register({ name: 'stats', description: 'Autoresearch: baseline, best, run count, noise (MAD) for the .auto/ session in the session working directory.', inputSchema: { type: 'object', properties: {} } })
    await $.tool.register({
      name: 'tail', description: 'Autoresearch: the last n log entries, compact (default 15).',
      inputSchema: { type: 'object', properties: { n: { type: 'integer', minimum: 1 } } },
    })
    await $.tool.register({ name: 'summary', description: 'Autoresearch: baseline -> best and a table of kept runs with each delta in the session working directory.', inputSchema: { type: 'object', properties: {} } })
    await refresh($)
    if ((await read($, snap)).active) void $.ui.open({ id: PANE, title: TITLE })
    return next(e)
  })

  on('tool.call', { tool: 'mcp__autoresearch__run' }, async ($, e) => {
    const { cfg, es } = await load($)
    const n = typeof e.repeats === 'number' ? e.repeats : cfg.repeats
    const timeout = typeof e.timeoutSec === 'number' ? e.timeoutSec * 1000 : undefined
    const t0 = Date.now()
    await refresh($)
    void $.ui.open({ id: PANE, title: TITLE })
    await update($, running, () => ({ startedAt: t0, repeats: n, checks: !!e.checks }))
    await update($, now, () => t0)
    const tick = $.clock.every(1000, () => void update($, now, () => Date.now()).then(() => showStatus($)))
    try {
      const samples: Record<string, number>[] = []
      for (let i = 0; i < n; i++) {
        const r = await sh($, $.process.spawn({ argv: ['bash', '.auto/measure.sh'] })[Symbol.asyncIterator](), timeout)
        if (r.exitCode !== 0) {
          await $.fs.write('.auto/.pending.json', JSON.stringify({ crash: true }))
          return { result: json({ crash: true, exitCode: r.exitCode, tail: (r.stdout + r.stderr).slice(-2000) }) }
        }
        const m = parseMetrics(r.stdout)
        if (!Object.keys(m).length) return { result: 'measure.sh printed no METRIC lines\n' + (r.stdout + r.stderr).slice(-2000), isError: true }
        samples.push(m)
      }
      const metrics = Object.fromEntries(Object.keys(samples[0]!).map(k => [k, median(samples.map(s => s[k]!))]))
      const res: Record<string, unknown> = {
        metrics, samples: samples.map(s => primary(s, cfg)), seconds: Math.round((Date.now() - t0) / 10) / 100,
      }
      let checksTail: string | undefined
      if (e.checks && (await $.fs.exists('.auto/checks.sh'))) {
        const r = await sh($, $.process.spawn({ argv: ['bash', '.auto/checks.sh'] })[Symbol.asyncIterator](), timeout)
        res.checks_ok = r.exitCode === 0
        if (r.exitCode) checksTail = (r.stdout + r.stderr).slice(-2000)
      }
      await $.fs.write('.auto/.pending.json', JSON.stringify(res))
      return { result: json({ ...res, checks_tail: checksTail, stats: stats(cfg, es, primary(metrics, cfg)) }) }
    } finally {
      tick.cancel()
      await update($, running, () => null)
      await showStatus($)
    }
  })

  on('tool.call', { tool: 'mcp__autoresearch__log' }, async ($, e) => {
    const status = String(e.status), desc = String(e.desc), why = String(e.why ?? '')
    if (!(STATUSES as readonly string[]).includes(status)) return { result: `bad status ${status}`, isError: true }
    const notes: string[] = []
    if (status === 'keep') {
      await $.process.run(['git', 'add', '-A'])
      // The message goes through a file so the git command line is fixed text.
      await $.fs.write('.auto/commit-msg', `ar: ${desc}\n`)
      const c = await $.process.run(['git', 'commit', '-F', '.auto/commit-msg'])
      if (c.exitCode) return { result: `git commit failed, nothing logged:\n${c.stdout}${c.stderr}`, isError: true }
    } else if (status !== 'baseline') {
      await $.process.run(['git', 'checkout', '--', '.'])
      await $.process.run(['git', 'clean', '-fd', '-e', '.auto'])
      notes.push('working tree reverted')
    }
    const pending = (await readOr($, PENDING)) ?? '{}'
    const { es } = await load($)
    const commit = (await $.process.run(['git', 'rev-parse', '--short', 'HEAD'])).stdout.trim()
    const entry: Entry = {
      run: es.length + 1, ts: new Date().toISOString().slice(0, 19), status, desc, why, commit,
      ...JSON.parse(pending),
    }
    const prev = (await readOr($, LOG)) ?? ''
    await $.fs.write('.auto/log.jsonl', prev + JSON.stringify(entry) + '\n')
    await $.fs.write('.auto/.pending.json', '{}')
    await refresh($)
    if (status === 'keep') $.ui.toast(`autoresearch: kept #${entry.run} ${desc}`)
    return { result: [`logged run ${entry.run} [${status}] ${desc} @ ${commit}`, ...notes].join('; ') }
  })

  on('tool.call', { tool: 'mcp__autoresearch__stats' }, async ($, e) => {
    const { cfg, es } = await load($)
    return { result: json(stats(cfg, es)) }
  })
  on('tool.call', { tool: 'mcp__autoresearch__tail' }, async ($, e) => {
    const { cfg, es } = await load($)
    return { result: tail(cfg, es, typeof e.n === 'number' ? e.n : 15) }
  })
  on('tool.call', { tool: 'mcp__autoresearch__summary' }, async ($, e) => {
    const { cfg, es } = await load($)
    return { result: summary(cfg, es) }
  })

  on('command.run', { command: 'autoresearch-dash' }, async $ => {
    await refresh($)
    await $.ui.open({ id: PANE, title: TITLE })
    await showStatus($)
    return { text: 'Autoresearch dashboard opened (focus it, then j/k to pick an experiment).' }
  })

  // Closing the dashboard brings the nudge back.
  on('ui.close', async ($, e, next) => {
    const r = await next(e)
    if (e.id === PANE) await showStatus($, true)
    return r
  })

  // Pick up hand edits to .auto/ made through Bash.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (/\.auto\//.test(e.command)) await refresh($)
    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const s = await read($, snap)
    if (!s.active) return <Text dimColor>No .auto/ session yet. It appears when an autoresearch run starts.</Text>
    const live = await read($, running)
    const t = await read($, now)
    const sel = await read($, selected)
    const cols = e.props.bodyColumns || e.viewport?.columns || 60
    const rows = e.viewport?.rows ?? 24
    const runs = s.runs
    const cur: Run | undefined = runs.find(r => r.run === sel) ?? runs[runs.length - 1]
    const idx = cur ? runs.indexOf(cur) : -1
    const pick = (i: number) => update($, selected, () => runs[Math.max(0, Math.min(runs.length - 1, i))]?.run ?? null)

    // List window: keep the selected row in view, newest at the bottom like a log.
    const listRows = Math.max(3, rows - 22)
    const start = Math.max(0, Math.min(idx - Math.floor(listRows / 2), runs.length - listRows))
    const window = runs.slice(start, start + listRows)
    const vals = runs.map(r => r.value).filter((v): v is number => v != null)
    const descW = Math.max(8, cols - 44)

    return (
      <Box flexDirection="column">
        <Text bold>{headline(s)}</Text>
        <Text dimColor>
          {progress(s)} · {s.direction === 'min' ? 'lower' : 'higher'} is better{s.noise != null ? ` · noise ±${fmt(s.noise)}` : ''}
        </Text>
        {vals.length > 1 && <Text color="cyan">{sparkline(vals, Math.max(10, cols - 2))}</Text>}
        {live && (
          <Text color="magenta">
            {SPIN[Math.floor((t - live.startedAt) / 1000) % SPIN.length]} measuring{live.repeats > 1 ? ` ×${live.repeats}` : ''}
            {live.checks ? ' + checks' : ''} · {ago(Math.max(0, t - live.startedAt))}
          </Text>
        )}
        {live?.last && <Text dimColor wrap="truncate">  {live.last}</Text>}
        <Text> </Text>
        <Text dimColor>{'   #   status         ' + (s.metric || 'value').padEnd(9) + 'Δ best   conf   commit   experiment'}</Text>
        {start > 0 && <Text dimColor>   … {start} earlier</Text>}
        {window.map(r => {
          const st = STATUS[r.status] ?? { color: 'white', label: r.status }
          const isSel = r === cur
          return (
            <Text key={`row-${r.run}`} inverse={isSel} wrap="truncate">
              <Text>{isSel ? ' › ' : '   '}</Text>
              <Text>{String(r.run).padEnd(4)}</Text>
              <Text color={st.color}>{st.label.padEnd(15)}</Text>
              <Text>{fmt(r.value).padEnd(9)}</Text>
              <Text>{(r.deltaPct != null ? signed(r.deltaPct) : '').padEnd(9)}</Text>
              <Text color={confColor(r.confidence)}>{(r.confidence != null ? `${r.confidence.toFixed(1)}×` : '').padEnd(7)}</Text>
              <Text dimColor>{r.commit.padEnd(9)}</Text>
              <Text>{r.desc.slice(0, descW)}</Text>
            </Text>
          )
        })}
        <Box flexDirection="row" gap={2}>
          <Button key="prev" hotkey="k" plain onPress={() => pick(idx - 1)}>up</Button>
          <Button key="next" hotkey="j" plain onPress={() => pick(idx + 1)}>down</Button>
          <Button key="latest" hotkey="l" plain onPress={() => update($, selected, () => null)}>latest</Button>
          <Button key="first" hotkey="g" plain onPress={() => pick(0)}>first</Button>
        </Box>
        <Text> </Text>
        {cur && detail({ r: cur, s, Box, Text, cols })}
      </Box>
    )
  })
}

function detail({ r, s, Box, Text, cols }: { r: Run; s: ReturnType<typeof snapshot>; Box: any; Text: any; cols: number }) {
  const st = STATUS[r.status] ?? { color: 'white', label: r.status }
  const m = s.metric || 'value'
  const row = (k: string, children: unknown) => (
    <Text wrap="wrap"><Text dimColor>{k.padEnd(11)}</Text>{children}</Text>
  )
  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1} width={Math.min(cols, 100)}>
      <Text bold>
        Experiment #{r.run} · <Text color={st.color}>{st.label}</Text>
        {r.run === s.bestRun ? <Text color="green"> · current best</Text> : ''}
      </Text>
      {row('idea', r.desc || '—')}
      {r.why ? row('why', r.why) : null}
      {row(m, `${fmt(r.value)}${r.deltaPct != null ? `  (${signed(r.deltaPct)} vs best at the time)` : ''}`)}
      {r.confidence != null
        ? row('confidence', <Text color={confColor(r.confidence)}>{r.confidence.toFixed(1)}× noise · {confWord(r.confidence)}</Text>)
        : null}
      {r.samples.length ? row('samples', r.samples.map(fmt).join(', ')) : null}
      {r.checksOk != null
        ? row('checks', <Text color={r.checksOk ? 'green' : 'yellow'}>{r.checksOk ? 'passed' : 'failed'}</Text>)
        : null}
      {row('commit', (r.commit || '—') + (r.status === 'keep' || r.status === 'baseline' ? '' : ' (changes reverted)'))}
      {row('when', r.ts.replace('T', ' ') + (r.seconds != null ? ` · took ${r.seconds}s` : ''))}
    </Box>
  )
}
