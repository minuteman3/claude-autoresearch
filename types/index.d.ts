export type Run = {
  run: number; status: string; desc: string; why: string; commit: string; ts: string
  value: number | null
  /** % change vs the best kept value before this run */
  deltaPct?: number
  /** |value - best before| / noise MAD */
  confidence?: number
  samples: number[]; seconds?: number; checksOk?: boolean
}
export type Snapshot = {
  active: boolean; metric: string; direction: 'min' | 'max'; maxIterations?: number
  baseline: number | null; best: number | null; bestRun: number | null
  noise: number | null; runs: Run[]; counts: Record<string, number>
}
/** A `run` tool call in flight. */
export type Running = { startedAt: number; repeats: number; checks: boolean; last?: string } | null

declare module 'claude-code' {
  interface PluginState {
    autoresearch: {
      snap: Snapshot
      /** run number shown in the detail panel; null follows the latest */
      selected: number | null
      running: Running
      now: number
    }
  }
}
