import type { Run, Snapshot } from '../types'

export type Config = { metric?: string; direction: 'min' | 'max'; repeats: number; maxIterations?: number }
export type Entry = {
  run: number; ts?: string; status: string; desc: string; why?: string; commit?: string
  metrics?: Record<string, number>; samples?: (number | null)[]; seconds?: number
  checks_ok?: boolean; crash?: boolean
}

export const STATUSES = ['baseline', 'keep', 'discard', 'checks_failed', 'crash'] as const

export const EMPTY: Snapshot = {
  active: false, dir: '', metric: '', direction: 'min', baseline: null, best: null, bestRun: null,
  noise: null, runs: [], counts: {},
}

export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

export function parseConfig(text: string | null): Config {
  const c = text ? JSON.parse(text) : {}
  return { ...c, direction: c.direction === 'max' ? 'max' : 'min', repeats: c.repeats ?? 1 }
}

export const parseLog = (text: string): Entry[] =>
  text.split('\n').filter(l => l.trim()).map(l => JSON.parse(l))

export const primary = (m: Record<string, number> | undefined, cfg: Config): number | null =>
  !m ? null : cfg.metric ? (m[cfg.metric] ?? null) : (Object.values(m)[0] ?? null)

const better = (a: number, b: number, cfg: Config) => (cfg.direction === 'min' ? a < b : a > b)

// METRIC name=<number> lines from measure.sh.
export function parseMetrics(stdout: string): Record<string, number> {
  const m: Record<string, number> = {}
  for (const [, k, v] of stdout.matchAll(/^METRIC\s+(\S+?)=([-\d.eE+]+)/gm)) m[k!] = Number(v)
  return m
}

// Noise = MAD of repeat samples around each run's own median, so real gains don't count as noise.
export function noise(es: Entry[]): number | null {
  const devs = es.flatMap(e => {
    const s = (e.samples ?? []).filter((x): x is number => x != null)
    if (s.length < 2) return []
    const md = median(s)
    return s.map(x => Math.abs(x - md))
  })
  return devs.length >= 3 ? median(devs) : null
}

export function stats(cfg: Config, es: Entry[], candidate?: number | null) {
  const good = es.filter(e => (e.status === 'baseline' || e.status === 'keep') && e.metrics)
  const vals = good.map(e => primary(e.metrics, cfg)).filter((v): v is number => v != null)
  if (!vals.length) return { error: 'no baseline yet' }
  let best = vals[0]!
  for (const v of vals) if (better(v, best, cfg)) best = v
  const mad = noise(es)
  const out: Record<string, unknown> = {
    baseline: vals[0], best, runs: es.length, direction: cfg.direction, noise_mad: mad,
  }
  if (candidate != null) {
    out.candidate = candidate
    out.improves = better(candidate, best, cfg)
    out.delta_pct = best ? Math.round(10000 * (candidate - best) / best) / 100 : null
    if (mad) {
      const c = Math.abs(candidate - best) / mad
      out.confidence = Math.round(c * 100) / 100
      out.verdict = c >= 2 ? 'real' : c >= 1 ? 'marginal - rerun' : 'noise - rerun'
    }
  }
  return out
}

export function tail(cfg: Config, es: Entry[], n: number): string {
  if (!es.length) return 'nothing logged'
  return es.slice(-n).map(e =>
    `#${String(e.run).padEnd(4)}${e.status.padEnd(14)}${String(primary(e.metrics, cfg)).padEnd(14)}${(e.commit ?? '').padEnd(9)}${e.desc}`,
  ).join('\n')
}

export function summary(cfg: Config, es: Entry[]): string {
  const keeps = es.filter(e => e.status === 'baseline' || e.status === 'keep')
  if (!keeps.length) return 'nothing logged'
  const b = primary(keeps[0]!.metrics, cfg)!
  let prev = b
  const lines = [`baseline ${b}  |  ${es.length} runs, ${keeps.length - 1} kept`, '']
  for (const e of keeps.slice(1)) {
    const v = primary(e.metrics, cfg)!
    lines.push(`#${String(e.run).padEnd(4)}${(e.commit ?? '').padEnd(9)}${fmt(v).padEnd(12)}${pct(v, prev).padStart(7)}  ${e.desc}`)
    prev = v
  }
  lines.push('', `total: ${b} -> ${prev} (${pct(prev, b)})`)
  return lines.join('\n')
}

export function snapshot(cfg: Config, es: Entry[], dir = ''): Snapshot {
  const mad = noise(es)
  let baseline: number | null = null, best: number | null = null, bestRun: number | null = null
  const counts: Record<string, number> = {}
  const runs: Run[] = es.map(e => {
    const value = primary(e.metrics, cfg)
    counts[e.status] = (counts[e.status] ?? 0) + 1
    const run: Run = {
      run: e.run, status: e.status, desc: e.desc ?? '', why: e.why ?? '', commit: e.commit ?? '',
      ts: e.ts ?? '', value, samples: (e.samples ?? []).filter((x): x is number => x != null),
      seconds: e.seconds, checksOk: e.checks_ok,
    }
    if (value != null && best != null) {
      run.deltaPct = (100 * (value - best)) / best
      if (mad) run.confidence = Math.abs(value - best) / mad
    }
    if (value != null && (e.status === 'baseline' || e.status === 'keep')) {
      if (baseline == null) baseline = value
      if (best == null || better(value, best, cfg)) { best = value; bestRun = e.run }
    }
    return run
  })
  return { active: true, dir, metric: cfg.metric ?? '', direction: cfg.direction, maxIterations: cfg.maxIterations,
    baseline, best, bestRun, noise: mad, runs, counts }
}

export const pct = (v: number, base: number) => `${v - base >= 0 ? '+' : ''}${((100 * (v - base)) / base).toFixed(1)}%`
export const fmt = (v: number | null) => (v == null ? '—' : Number(v.toPrecision(5)).toString())

const BARS = '▁▂▃▄▅▆▇█'
export function sparkline(vals: number[], width: number): string {
  const xs = vals.slice(-width)
  if (!xs.length) return ''
  const lo = Math.min(...xs), hi = Math.max(...xs)
  return xs.map(v => BARS[hi === lo ? 3 : Math.round(((v - lo) / (hi - lo)) * 7)]).join('')
}

export const EMPTY_DIR = ''

/** "best 15.7 ms, 60.7% better than baseline 39.9 ms" */
export function headline(s: Snapshot): string {
  const m = s.metric || 'metric'
  if (s.baseline == null || s.best == null) return `no baseline yet for ${m}`
  const change = (100 * (s.best - s.baseline)) / s.baseline
  const improved = s.direction === 'min' ? change < 0 : change > 0
  const word = change === 0 ? 'same as' : improved ? 'better than' : 'worse than'
  const amt = change === 0 ? '' : `${Math.abs(change).toFixed(1)}% `
  return `best ${fmt(s.best)} ${m}, ${amt}${word} baseline ${fmt(s.baseline)}`
}

export function progress(s: Snapshot): string {
  const n = s.runs.length
  const parts = [s.maxIterations ? `${n} of ${s.maxIterations} runs` : `${n} runs`]
  const c = s.counts
  if (c.keep) parts.push(`${c.keep} kept`)
  if (c.discard) parts.push(`${c.discard} discarded`)
  if (c.checks_failed) parts.push(`${c.checks_failed} failed checks`)
  if (c.crash) parts.push(`${c.crash} crashed`)
  return parts.join(' · ')
}

export const confColor = (c?: number) => (c == null ? undefined : c >= 2 ? 'green' : c >= 1 ? 'yellow' : 'red')
export const confWord = (c?: number) => (c == null ? '' : c >= 2 ? 'likely real' : c >= 1 ? 'marginal' : 'within noise')

/**
 * Status-line summary; ends with a nudge to open the dashboard while it is hidden.
 * "autoresearch: best 7.6 ms (81% better than baseline) · 4/10 runs · /autoresearch-dash for details"
 */
export function statusLine(s: Snapshot, measuringMs: number | null, dashShown: boolean): string | undefined {
  if (!s.active) return undefined
  const parts: string[] = []
  if (measuringMs != null) parts.push(`measuring ${Math.floor(measuringMs / 1000)}s`)
  if (s.baseline != null && s.best != null) {
    const change = (100 * (s.best - s.baseline)) / s.baseline
    const improved = s.direction === 'min' ? change < 0 : change > 0
    const vs = change === 0 ? 'same as baseline' : `${Math.abs(change).toFixed(0)}% ${improved ? 'better' : 'worse'} than baseline`
    parts.push(`best ${fmt(s.best)} ${s.metric || ''}`.trimEnd() + ` (${vs})`)
  } else if (measuringMs == null) parts.push('no baseline yet')
  const n = s.runs.length
  if (n) parts.push(s.maxIterations ? `${n}/${s.maxIterations} runs` : `${n} runs`)
  if (!dashShown) parts.push('/autoresearch-dash for details')
  return `autoresearch: ${parts.join(' · ')}`
}
