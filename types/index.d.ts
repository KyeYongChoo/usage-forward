// The highest whole percent already forwarded for one window, and the reset
// it belongs to: a new `resetsAt` re-arms the window.
export type Forwarded = { percent: number; resetsAt?: string }

declare module 'claude-code' {
  interface PluginState {
    'usage-forward': {
      enabled: boolean
      sent: Record<string, Forwarded>
    }
  }
}
