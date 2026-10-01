import { test, expect } from 'claude-code/testing'

const LOG = "{\"run\":1,\"ts\":\"2026-10-01T20:15:16\",\"status\":\"baseline\",\"desc\":\"baseline\",\"why\":\"\",\"commit\":\"d78d6dc\",\"metrics\":{\"ms\":39.9},\"samples\":[41.7,39.9,32.7],\"seconds\":0.19}\n{\"run\":2,\"ts\":\"2026-10-01T20:15:27\",\"status\":\"keep\",\"desc\":\"generator sum instead of per-item list\",\"why\":\"avoids allocating a list per iteration\",\"commit\":\"278a7d9\",\"metrics\":{\"ms\":15.7},\"samples\":[14.6,15.7,20.9],\"seconds\":0.13,\"checks_ok\":true}\n{\"run\":3,\"ts\":\"2026-10-01T20:15:37\",\"status\":\"checks_failed\",\"desc\":\"off-by-one range (deliberate break)\",\"why\":\"\",\"commit\":\"278a7d9\",\"metrics\":{\"ms\":21.3},\"samples\":[21.3],\"seconds\":0.06,\"checks_ok\":false}\n"
const CFG = '{"metric":"ms","direction":"min","maxIterations":10}'

test('dashboard draws list + detail and j/k moves the selection', async ($, on) => {
  on('fs.exists', async () => ({ value: true }))
  on('fs.read', async (_$, e) => ({ value: e.path.endsWith('config.json') ? CFG : LOG }))
  on('ui.open', async () => ({ value: undefined }))
  on('ui.panes', async () => ({ value: [] }))
  on('ui.status', async () => ({ value: undefined }))
  await $.command.run({ command: 'autoresearch-dash' })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'autoresearch', surface, component: 'Pane', requestId: 'autoresearch',
      props: { title: 'Autoresearch', isFocused: true, bodyColumns: 100, placement: 'dock',
        scroll: { offset: 0, bodyRows: 40 }, view: {} },
    })
    expect(await ui.find({ type: 'Text', text: /best 15\.7 ms, 60\.7% better than baseline 39\.9/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /3 of 10 runs · 1 kept · 1 failed checks/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Experiment #3/ })).toBeDefined()
    await ui.press({ key: 'prev' })
    expect(await ui.find({ type: 'Text', text: /Experiment #2/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /avoids allocating/ })).toBeDefined()
    await ui.press({ key: 'latest' })
    await ui.unmount()
  }
})
