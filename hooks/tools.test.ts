import { test, expect } from 'claude-code/testing'

test('summary tool answers from .auto/', async ($, on) => {
  on('fs.read', async () => ({ value: '' }))
  on('fs.exists', async () => ({ value: true }))
  const r = await $.tool.call({ tool: 'mcp__autoscience__summary' })
  expect(String(r.result ?? r.text)).toContain('nothing logged')
})
