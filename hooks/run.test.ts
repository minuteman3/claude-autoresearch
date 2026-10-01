import { test, expect, mock } from 'claude-code/testing'

const files: Record<string, string> = {}
const seed: Record<string, string> = {
  'repo/.auto/config.json': '{"metric":"ms","direction":"min"}',
  'repo/.auto/log.jsonl': JSON.stringify({ run: 1, status: 'baseline', desc: 'b', commit: 'a', metrics: { ms: 10 }, samples: [10] }) + '\n',
}
// The engine hands fs hooks resolved paths; key the fake files by their repo-relative tail.
const rel = (p: string) => p.slice(p.indexOf('repo/'))

test('run streams measure.sh and reports metrics vs best', async ($, on) => {
  Object.assign(files, seed)
  mock.clock(on)
  on('fs.exists', async (_$, e) => ({ value: rel(e.path) in files || e.path.endsWith('checks.sh') }))
  on('fs.read', async (_$, e) => ({ value: files[rel(e.path)] ?? '' }))
  on('fs.write', async (_$, e) => { files[rel(e.path)] = e.text; return { value: undefined } })
  on('ui.open', async () => ({ value: undefined }))
  on('ui.panes', async () => ({ value: [] }))
  on('ui.status', async () => ({ value: undefined }))
  on('process.spawn', async function* (_$, e) {
    expect(e.cwd?.endsWith('repo')).toBe(true)
    if (e.argv[1]!.endsWith('measure.sh')) {
      yield { stream: 'stderr' as const, text: 'warming up\n' }
      yield { stream: 'stdout' as const, text: 'METRIC ms=6.5\n' }
      return { value: { code: 0, signal: null } }
    }
    return { value: { code: 1, signal: null } } // checks.sh fails
  })
  const r = await $.tool.call({ tool: 'mcp__autoresearch__run', dir: 'repo', checks: true })
  const out = JSON.parse(String(r.result))
  expect(out.metrics).toEqual({ ms: 6.5 })
  expect(out.checks_ok).toBe(false)
  expect(out.stats.improves).toBe(true)
  expect(JSON.parse(files['repo/.auto/.pending.json']!).metrics).toEqual({ ms: 6.5 })
})
