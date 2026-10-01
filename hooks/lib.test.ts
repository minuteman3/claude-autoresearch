import { test, expect } from 'claude-code/testing'
import { headline, statusLine, parseConfig, parseLog, parseMetrics, progress, snapshot, stats, summary, sparkline } from './lib'

const log = [
  { run: 1, status: 'baseline', desc: 'baseline', commit: 'a', metrics: { t: 10 }, samples: [10, 10.2, 9.9] },
  { run: 2, status: 'discard', desc: 'x', commit: 'a', metrics: { t: 11 }, samples: [11] },
  { run: 3, status: 'keep', desc: 'y', commit: 'b', metrics: { t: 8 }, samples: [8, 8.1, 7.9] },
].map(o => JSON.stringify(o)).join('\n')
const cfg = parseConfig('{"metric":"t","direction":"min","maxIterations":50}')

test('snapshot, headline and progress text', async () => {
  const s = snapshot(cfg, parseLog(log))
  expect(s.baseline).toBe(10)
  expect(s.best).toBe(8)
  expect(s.bestRun).toBe(3)
  expect(headline(s)).toBe('best 8 t, 20.0% better than baseline 10')
  expect(progress(s)).toBe('3 of 50 runs · 1 kept · 1 discarded')
  expect(s.runs[2]!.deltaPct).toBe(-20)
  expect(s.runs[1]!.deltaPct).toBe(10)
})

test('stats verdict uses MAD noise', async () => {
  const r = stats(cfg, parseLog(log), 7.5) as Record<string, unknown>
  expect(r.improves).toBe(true)
  expect(Math.abs((r.noise_mad as number) - 0.1) < 1e-9).toBe(true)
  expect(r.verdict).toBe('real')
  expect((stats(cfg, parseLog(log), 7.95) as Record<string, unknown>).verdict).toBe('noise - rerun')
})

test('METRIC parsing, summary, max direction', async () => {
  expect(parseMetrics('noise\nMETRIC t=1.5\nMETRIC size=2e3\n')).toEqual({ t: 1.5, size: 2000 })
  expect(summary(cfg, parseLog(log))).toContain('total: 10 -> 8 (-20.0%)')
  expect(snapshot(parseConfig('{"metric":"t","direction":"max"}'), parseLog(log)).best).toBe(10)
  expect(sparkline([1, 2, 3], 10).length).toBe(3)
})

test('status line summarises and nudges only while the dashboard is hidden', async () => {
  const s = snapshot(cfg, parseLog(log))
  expect(statusLine(s, null, false)).toBe('autoresearch: best 8 t (20% better than baseline) · 3/50 runs · /autoresearch-dash for details')
  expect(statusLine(s, null, true)).toBe('autoresearch: best 8 t (20% better than baseline) · 3/50 runs')
  expect(statusLine(s, 12_400, true)).toBe('autoresearch: measuring 12s · best 8 t (20% better than baseline) · 3/50 runs')
})
