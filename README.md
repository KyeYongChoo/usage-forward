# usage-forward

A Claude Code mod that forwards plan-usage warnings to Claude itself.
Submitted to the Anthropic public plugin marketplace.

Normally the CLI shows *you* a warning as your 5-hour (or weekly) usage limit
climbs past 90%. If you've left Claude working alone, nobody reads it. With
this mod switched on, each time a window crosses a whole percent from **90% to
99%**, Claude gets a short hidden note:

```
[usage-forward] Plan usage warning, forwarded from the CLI because the user may be away:
- 5-hour session limit: 93% used, resets in 1h 12m

The user asked for one of these notes per percent from 90% to 99%. Pace the
remaining work against them: before the limit reaches 100%, finish or checkpoint
the current step and make sure the handover documents are written ...
```

Nothing is sent at 100%, because by then it's too late.

The note is added to the conversation as it happens, so Claude reads it on its
next step, even in the middle of a long task. You don't have to send a new
prompt for it to arrive.

## Usage

| Command | Effect |
| --- | --- |
| `/usage-forward on` | Start forwarding. If a window is already at 90% or more, Claude is warned right away. |
| `/usage-forward off` | Stop forwarding. |
| `/usage-forward` | Show whether it's on, plus the current percentages. |

It's **off by default and resets with each session**, so switch it on when you
plan to walk away. While it's on, `usage-forward on` shows in the status line.

Each window (`five_hour`, `seven_day`) is warned at most once per percent. A
new reset time starts the count again.

## How it works

`hooks/register.ts` hooks `session.measure`, which the engine raises whenever
a rate-limit window moves a whole point. When forwarding is on, the hook adds
the note as a hidden user message with `$.session.append`. A running turn picks
the note up at its next step.

The numbers are the same ones the statusline gets, and they only exist on a
Pro or Max plan, after the session's first response.

## Install (from this folder)

```
claude plugin marketplace add C:\Users\chook\Desktop\usage-forward
claude plugin install usage-forward@usage-forward
```

Because the marketplace is a local folder, the installed mod runs from this
folder. After editing it, run `/reload-plugins`.

For a single session only: `claude --plugin-dir C:\Users\chook\Desktop\usage-forward`.

## Develop

```
claude plugin validate .
claude plugin test .
```
