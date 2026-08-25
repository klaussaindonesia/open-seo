# Shared preamble — all SEO/GEO cron jobs

This file is prepended to every job prompt by `run.sh`. It holds the rules
that are identical across jobs, so they cannot drift apart.

## Project

klaussa.com, OpenSEO project ID `60bfa4e0-fc18-452a-845b-70c99f82644e`.

## MCP server

Use the **`openseo-cron`** MCP server for every OpenSEO tool call. It
authenticates with a Cloudflare Access Service Token and works unattended. Do
not use a server named plain `openseo` if one is also configured — that one
requires an interactive human login and will fail here.

## Step 0 — ground yourself before doing anything else

Call `get_project_context` (free, no credits) and read it. It is the single
source of truth for:

- **business_overview** — what Klaussa is, its surfaces, its audience, and the
  current traffic shape.
- **current_goal** — what this POC is trying to move, and what is already
  known to be broken. Read this before deciding anything is "new".
- **positioning** — competitive stance. Marked as a working hypothesis; treat
  it as context, not fact.
- **writing_preferences** — house style. Binding for any content you draft.
- **competitors** — the canonical competitor list. Use this instead of any
  hardcoded names.
- **keyPages** — the pages that matter, with their role (hub/spoke/money) and
  measured performance. Prioritise these.
- **researchLog** — what research has already been bought. **Check this before
  spending credits on anything.** If a log entry already answers your
  question, use it instead of re-buying.

Do not restate context back to the user in your final summary; act on it.

## Budget discipline

`seo-geo-cron/data/budget.json` holds the month-by-month spend plan, measured
unit prices, and a `monthly_ceiling_usd` per month. Before any paid call:

1. Work out which month of the POC we are in (month 1 began 2026-08-25).
2. Use that month's schedule and volumes — do not invent your own cadence.
3. Free tools (`get_project_context`, `get_search_console_performance`, the
   Google Analytics tools, `get_audit_status`, `get_audit_issues`,
   `get_audit_pages`) are unmetered. Use them freely.
4. If a planned batch would exceed that month's ceiling, do the highest-value
   subset and escalate the shortfall rather than overspending.

After buying any non-trivial research, append a one-line
`appendResearchLog` entry via `update_project_context` saying what you bought
and what it answered, so a later run does not re-buy it. That summary is
capped at 1000 chars server-side -- keep it to one line or the call is
rejected.

## Guardrails (all jobs)

- Never force-push. Never merge your own PR. Never run `gh pr merge`.
- Never publish content yourself. The writer-bot account cannot approve, by
  design — drafts go to a human by email.
- Max **one** PR/content draft and **one** escalation issue per run.
- Escalation issues: `gh issue create --repo klaussaindonesia/klaussa_fe
  --label seo-geo-escalation`.
- Every PR, issue, or content draft must cite the data it acted on (audit ID,
  GSC date range, rank-tracker snapshot date, GEO run date) so a human can
  trace the decision back to its source.
- You are a single-shot process invoked by cron. Nothing will resume you
  later, so never schedule a follow-up or "check back in N minutes" — finish
  the work in this turn or escalate.
