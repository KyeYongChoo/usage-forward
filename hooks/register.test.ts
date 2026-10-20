import { expect, mock, test } from 'claude-code/testing'
import type { On, SessionRateLimit } from 'claude-code'

const RESET = '2099-01-01T00:00:00.000Z'
const CONTEXT = { window: 200000 }
const TYPED = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const

function engine(on: On, now: () => SessionRateLimit[]) {
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: CONTEXT, rateLimits: now() },
  }))
  on('ui.status', () => ({ value: undefined }))
}

function texts(rows: ReturnType<ReturnType<typeof mock.session>['appended']>) {
  return rows.map(row =>
    row.message.content.map(block => ('text' in block ? block.text : '')).join(''),
  )
}

test('forwards one warning per percent from 90 to 99, none at 100', async ($, on) => {
  let limits: SessionRateLimit[] = []
  engine(on, () => limits)
  const session = mock.session(on)

  await $.command.run({ command: 'usage-forward', args: 'on', ...TYPED })
  for (const percentUsed of [89, 90, 90.4, 91, 99, 100]) {
    limits = [{ kind: 'five_hour', percentUsed, resetsAt: RESET }]
    await $.session.measure({ context: CONTEXT, rateLimits: limits, changed: ['rateLimits'] })
  }

  const sent = texts(session.appended())
  expect(sent.length).toBe(3)
  expect(sent[0]).toContain('5-hour session limit: 90% used')
  expect(sent[1]).toContain('91% used')
  expect(sent[2]).toContain('99% used')
})

test('stays quiet while off', async ($, on) => {
  engine(on, () => [])
  const session = mock.session(on)

  const rateLimits = [{ kind: 'five_hour', percentUsed: 95, resetsAt: RESET }]
  await $.session.measure({ context: CONTEXT, rateLimits, changed: ['rateLimits'] })

  expect(session.appended().length).toBe(0)
})

test('turning on past 90 warns at once through the command', async ($, on) => {
  engine(on, () => [{ kind: 'seven_day', percentUsed: 93.2, resetsAt: RESET }])
  const session = mock.session(on)

  const ran = await $.command.run({ command: 'usage-forward', args: 'on', ...TYPED })
  expect(ran.context?.[0]).toContain('weekly limit: 93% used')

  // The same percent is not forwarded again when it is measured.
  const rateLimits = [{ kind: 'seven_day', percentUsed: 93.6, resetsAt: RESET }]
  await $.session.measure({ context: CONTEXT, rateLimits, changed: ['rateLimits'] })
  expect(session.appended().length).toBe(0)
})

test('a new reset re-arms the window', async ($, on) => {
  engine(on, () => [])
  const session = mock.session(on)
  await $.command.run({ command: 'usage-forward', args: 'on', ...TYPED })

  for (const resetsAt of [RESET, '2099-01-01T05:00:00.000Z']) {
    const rateLimits = [{ kind: 'five_hour', percentUsed: 92, resetsAt }]
    await $.session.measure({ context: CONTEXT, rateLimits, changed: ['rateLimits'] })
  }

  expect(session.appended().length).toBe(2)
})
