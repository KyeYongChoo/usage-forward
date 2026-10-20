import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import type { Forwarded } from '../types'

const NAME = 'usage-forward'
const FROM = 90
const LABELS: Record<string, string> = {
  five_hour: '5-hour session limit',
  seven_day: 'weekly limit',
}

const enabled = atom({ plugin: 'usage-forward', key: 'enabled' } as const, false)
const sent = atom(
  { plugin: 'usage-forward', key: 'sent' } as const,
  {} as Record<string, Forwarded>,
)

// The windows at FROM..99 that moved past what was already forwarded. At 100
// the limit has hit and a warning no longer helps.
function due(limits: readonly SessionRateLimit[], done: Record<string, Forwarded>) {
  return limits.flatMap(limit => {
    const percent = Math.floor(limit.percentUsed)
    if (!(limit.kind in LABELS) || percent < FROM || percent >= 100) return []
    const prev = done[limit.kind]
    const isSent = prev && prev.resetsAt === limit.resetsAt && prev.percent >= percent

    return isSent ? [] : [{ ...limit, percent }]
  })
}

function resetText(resetsAt: string | undefined) {
  if (!resetsAt) return ''
  const minutes = Math.round((Date.parse(resetsAt) - Date.now()) / 60000)
  if (!(minutes > 0)) return ''
  const h = Math.floor(minutes / 60)

  return `, resets in ${h > 0 ? `${h}h ` : ''}${minutes % 60}m`
}

function warning(windows: ReturnType<typeof due>) {
  const lines = windows.map(
    w => `- ${LABELS[w.kind]}: ${w.percent}% used${resetText(w.resetsAt)}`,
  )

  return [
    `[${NAME}] Plan usage warning, forwarded from the CLI because the user may be away:`,
    ...lines,
    '',
    `The user asked for one of these notes per percent from ${FROM}% to 99%. Pace the`,
    'remaining work against them: before the limit reaches 100%, finish or checkpoint',
    'the current step and make sure the handover documents are written (what is done,',
    'what is in progress, next steps, how to resume). You do not need to reply to this note.',
  ].join('\n')
}

async function markSent($: EngineInterface, windows: ReturnType<typeof due>) {
  await update($, sent, done => {
    const next = { ...done }
    for (const w of windows) next[w.kind] = { percent: w.percent, resetsAt: w.resetsAt }

    return next
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: NAME,
      description: `Forward plan-usage warnings (${FROM}-99%) to Claude: on, off or status`,
    })
    $.ui.status((await read($, enabled)) ? `${NAME} on` : undefined)

    return next(e)
  })

  on('command.run', { command: NAME }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'on') {
      await update($, enabled, () => true)
      $.ui.status(`${NAME} on`)
      // A window already past FROM is forwarded now: the next measurement
      // only comes when it moves another point.
      const { rateLimits } = await $.session.usage()
      const windows = due(rateLimits, await read($, sent))
      if (windows.length === 0) {
        return { text: `${NAME} is on: Claude is warned at each percent from ${FROM}% to 99%.` }
      }
      await markSent($, windows)

      return {
        text: `${NAME} is on. Already past ${FROM}%, so Claude has been warned now.`,
        context: [warning(windows)],
      }
    }

    if (arg === 'off') {
      await update($, enabled, () => false)
      $.ui.status(undefined)

      return { text: `${NAME} is off.` }
    }

    const { rateLimits } = await $.session.usage()
    const known = rateLimits
      .filter(limit => limit.kind in LABELS)
      .map(limit => `${LABELS[limit.kind]} ${limit.percentUsed}%`)
    const state = (await read($, enabled)) ? 'on' : 'off'

    return {
      text: `${NAME} is ${state}. ${known.length ? known.join(', ') : 'No usage reading yet.'} Use /${NAME} on|off.`,
    }
  }).catch(() => ({ text: `${NAME}: the command failed; see claude --debug.` }))

  on('session.measure', async ($, e, next) => {
    const measured = await next(e)
    if (!e.changed.includes('rateLimits') || !(await read($, enabled))) return measured

    const windows = due(e.rateLimits, await read($, sent))
    if (windows.length === 0) return measured
    await markSent($, windows)
    await $.session.append({
      message: { type: 'user', content: [{ type: 'text', text: warning(windows) }] },
    })

    return measured
  })
}
