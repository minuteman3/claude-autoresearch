import { test, expect } from 'claude-code/testing'

test('log keep commits through a fixed git command line', async ($, on) => {
  const files: Record<string, string> = { '.auto/.pending.json': '{"metrics":{"ms":5}}', '.auto/log.jsonl': '' }
  const rel = (p: string) => p.slice(p.indexOf('.auto/'))
  const ran: string[][] = []
  on('fs.exists', async (_$, e) => ({ value: rel(e.path) in files }))
  on('fs.read', async (_$, e) => ({ value: files[rel(e.path)] ?? '' }))
  on('fs.write', async (_$, e) => { files[rel(e.path)] = e.text; return { value: undefined } })
  on('ui.panes', async () => ({ value: [] }))
  on('ui.status', async () => ({ value: undefined }))
  on('ui.toast', async () => ({ value: undefined }))
  on('process.run', async (_$, e) => {
    ran.push(e.argv)
    return { value: { exitCode: 0, stdout: e.argv[1] === 'rev-parse' ? 'abc1234\n' : '', stderr: '' } }
  })
  const r = await $.tool.call({ tool: 'mcp__autoresearch__log', status: 'keep', desc: 'inline the hot loop; rm -rf $HOME' })
  expect(String(r.result)).toContain('logged run 1 [keep]')
  expect(ran).toEqual([['git', 'add', '-A'], ['git', 'commit', '-F', '.auto/commit-msg'], ['git', 'rev-parse', '--short', 'HEAD']])
  expect(files['.auto/commit-msg']).toBe('ar: inline the hot loop; rm -rf $HOME\n')
  expect(JSON.parse(files['.auto/log.jsonl']!.trim()).commit).toBe('abc1234')
})
