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

## Ground yourself before doing anything else

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

## Outcome tracking (`actions.sqlite`)

Every content-drafting job (SEO, GEO) shares one SQLite file,
`seo-geo-cron/data/actions.sqlite` (gitignored — separate from
`geo-history.sqlite`, which tracks per-prompt citation results, a
different concern). Create it if absent:

```sql
CREATE TABLE IF NOT EXISTS actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job TEXT NOT NULL CHECK (job IN ('seo', 'geo')),
  run_date TEXT NOT NULL,
  cluster_topic TEXT NOT NULL,
  cluster_keywords TEXT NOT NULL,
  source_page_url TEXT,
  target_page_url TEXT,
  action_type TEXT NOT NULL,
  blog_id TEXT,
  baseline_metrics TEXT,
  status TEXT NOT NULL CHECK (status IN ('drafted', 'proposed', 'judged')),
  outcome TEXT CHECK (outcome IN ('improved', 'flat', 'worse', 'rejected')),
  outcome_metrics TEXT,
  created_at TEXT NOT NULL,
  judged_at TEXT,
  indexed_at TEXT
);
```

`source_page_url` and `indexed_at` were both added after this table may
already have existed on disk with real rows in it — `CREATE TABLE IF
NOT EXISTS` is a no-op against a table that already exists, so it will
**not** add new columns by itself. Before doing anything else with this
table, ensure both columns exist:
```python
import sqlite3
conn = sqlite3.connect('seo-geo-cron/data/actions.sqlite')
for column in ('source_page_url', 'indexed_at'):
    try:
        conn.execute(f'ALTER TABLE actions ADD COLUMN {column} TEXT')
        conn.commit()
    except sqlite3.OperationalError as e:
        if 'duplicate column name' not in str(e):
            raise  # some other real error -- do not swallow it
```
This is safe to run every time: each column is either added once or
fails harmlessly with "duplicate column name" on every run after that.

**Mirror every write to the dashboard.** Immediately after each successful
local write below, call the `record_content_action` MCP tool with the same
values (it upserts by `blog_id`, so calling it repeatedly for the same blog as
it moves through the pipeline is exactly the intended usage). This populates
OpenSEO's **SEO Pipeline** page so the dashboard shows what the cron actually
did. It uses no credits.

This mirror is **best-effort**: if the call fails, note it in the research log
and carry on. `actions.sqlite` is the source of truth for every decision this
job makes; a missed mirror write is a stale dashboard row, never a wrong
decision. Never retry in a way that blocks the run, and never skip or roll back
a local write because the mirror failed.

While you are in the indexing check below, you already fetch each row's current
blog status via `GET /blogs/{blog_id}` — pass that status through to
`record_content_action` (`published`, `rejected` when it has gone back to
`draft`, otherwise the row's existing status). That daily read is what keeps the
dashboard's approval state fresh without waiting for Step 0's 14-day window.

`cluster_keywords`, `baseline_metrics`, and `outcome_metrics` are JSON
stored as text (SQLite has no native JSON type). `baseline_metrics` /
`outcome_metrics` shape: `{"position": <number|null>, "ctr":
<number|null>, "impressions": <number|null>, "clicks": <number|null>,
"measured_at": "<date>"}`.

`source_page_url` and `target_page_url` answer two different questions
and must never be conflated: `source_page_url` is the existing page (if
any) that made you consider this candidate in the first place — used to
recognize "I already acted on this page" so it isn't picked again.
`target_page_url` is the page Step 0 actually measures 14 days later —
always the URL the action itself produced, since that's the only page
the action could have changed. For a brand-new topic with no existing
page, `source_page_url` is null.

**Step 0 of every run, before anything else**: query your own job's rows
(`WHERE job = '<seo|geo>'` — the table is shared for storage convenience,
never cross-check the other job's rows) where `status = 'proposed'` and
`run_date` is 14 or more days ago.

- None found → proceed straight to this job's own instructions.
- For each match, `GET /blogs/{blog_id}` (free, read-only — a fresh read
  on a new run, not polling within a run):
  - Still `need_approval` after 14+ days → check whether an issue titled
    "[SEO/GEO] N drafts unreviewed after 14+ days" already exists first
    (matching the rank-tracker escalation's own convention) — if so, do
    not re-file it; the row stays `proposed` and this check simply
    repeats harmlessly on future runs. Otherwise escalate once this run,
    naming every such `blog_id` (sitting unreviewed for two weeks is
    itself a signal worth surfacing).
  - `status: draft` (was rejected) → `UPDATE actions SET
    status='judged', outcome='rejected', judged_at=<today> WHERE
    id=<row id>`. No further action for that row.
  - `status: published` → pull fresh GSC performance for
    `target_page_url` (same dimensions as your normal run), compare
    against `baseline_metrics`. Judge `improved`/`flat`/`worse` the same
    way you'd judge any other threshold in this file — meaningful
    movement in position or CTR, not a rigid formula. Write `outcome`,
    `outcome_metrics`, `status='judged'`, `judged_at=<today>`.

Only once Step 0 is done for every eligible row do you move on to finding
new opportunities.

**Indexing check, also every run, free (no credits):** there is no
reliable API to make Google index a page faster (checked directly:
Google's sitemap-ping is deprecated, the Indexing API only covers
JobPosting/BroadcastEvent, IndexNow doesn't cover Google) — the only
thing automatable is *checking* status and surfacing a one-click link
for the one manual lever that does work. Query your own job's rows
where `target_page_url IS NOT NULL` and `indexed_at IS NULL` (this is
not limited to 14+-day-old rows like Step 0 above — check every one,
every run, so indexing gets caught within a day or two of publish, not
up to two weeks later):

- `GET /blogs/{blog_id}`. Still not `published` → nothing to check yet,
  skip.
- `published` → `inspect_urls` with `target_page_url` (free, batch up
  to 10 URLs per call rather than one row at a time). Read
  `indexStatusResult.coverageState` and `.verdict` — if the coverage
  text indicates the page is actually indexed (not "URL is unknown to
  Google" or similar not-yet-crawled states), set `indexed_at=<today>`.
- Still not indexed **and** `created_at` was 2+ days ago → append an
  `appendResearchLog` entry naming the page and pasting the response's
  own `inspectionResultLink` verbatim (a real, working, pre-filled
  Search Console URL — `inspect_urls` generates a fresh one on every
  call, you do not need to and should not try to construct this URL
  yourself). That link is a genuine one-click path to GSC's own
  "Request Indexing" button — the actual, honest ceiling of what's
  automatable here. Not urgent enough to spend the one escalation slot
  on; the research log is the right channel.

## Guardrails (all jobs)

- Never force-push. Never merge your own PR. Never run `gh pr merge`.
- Never publish content yourself. The writer-bot account cannot approve, by
  design — drafts go to a human by email.
- Content-draft cap is per job: SEO up to **5** per run, GEO up to **2**
  per run — delivered as **one digest email** per run regardless of item
  count (mechanics in `seo.md`'s Publishing section, reused by `geo.md`).
  Escalation cap stays **one** issue per run for every job, unchanged.
- If more than one escalation condition fires in the same run, fold them
  into that one allowed issue rather than dropping all but the first
  one you noticed — a failure/orphaned-work condition (e.g. a failed
  digest send, drafts left unrecorded) always outranks a purely
  informational one (e.g. a missing-config notice).
- Escalation issues: `gh issue create --repo klaussaindonesia/klaussa_fe
  --label seo-geo-escalation`.
- Every PR, issue, or content draft must cite the data it acted on (audit ID,
  GSC date range, rank-tracker snapshot date, GEO run date) so a human can
  trace the decision back to its source.
- You are a single-shot process invoked by cron. Nothing will resume you
  later, so never schedule a follow-up or "check back in N minutes" — finish
  the work in this turn or escalate.
