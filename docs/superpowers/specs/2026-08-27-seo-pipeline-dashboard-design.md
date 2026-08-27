# SEO Pipeline Dashboard — Design Spec

Date: 2026-08-27
Status: Approved for implementation

## 1. Context

The SEO/GEO cron system (see `2026-08-27-seo-geo-velocity-and-outcome-tracking-design.md`)
tracks its own decision loop — keyword → drafted blog → human approval →
indexed → ranked — entirely in `seo-geo-cron/data/actions.sqlite`, a file
on the laptop running the cron. That data is invisible to OpenSEO's own
dashboard: OpenSEO is a multi-tenant Cloudflare Workers app (D1/Postgres,
KV) with zero access to a file on a residential machine.

The user wants this pipeline made explicit as a real page inside OpenSEO,
under "My Site" → "SEO Pipeline", so the CLI (cron) and the dashboard tell
the same story instead of the dashboard being blind to what the cron
actually does.

## 2. Goals / Non-goals

**Goals:**
- A new project-scoped OpenSEO page, four tabs, showing the full
  keyword → blog → indexed? → ranked pipeline using real data, not a
  reimplementation of the cron's logic.
- The cron's existing local `actions.sqlite` writes get mirrored into
  OpenSEO's own storage in real time, so the dashboard never lags behind
  what the CLI already knows.
- Zero change to the cron's own decision-making (exclusion sets, Step 0
  judging, the indexing check) — those already work and were hardened
  through a real regression this session. This feature only adds a
  parallel write next to each one, never replaces the local read/write
  path the cron's logic depends on.

**Non-goals:**
- A generic, any-customer "content actions" abstraction. Explicitly
  scoped to Klaussa's actual shape (a Tiptap blog via `klaussa_be`,
  `klaussa.com` URLs) — confirmed with the user rather than assumed.
- Any write/action capability from the new page (approve, reject, resend
  a digest, request indexing). Every real action keeps its existing path
  (the review email, GSC's own UI); this page is read-only reporting.
- Duplicating the existing Rank Tracking page's position/volume data.
  Keyword Coverage links out to it instead of re-rendering it.
- Migrating `actions.sqlite` itself off the laptop. It stays the cron's
  own source of truth; D1 is a mirror for the dashboard to read, not a
  replacement.

## 3. Data model

Following this codebase's established dual-schema pattern (two parallel
Drizzle files, not a shared abstraction — see `src/db/gsc.schema.ts` /
`src/db/pg/gsc.schema.ts`, kept structurally identical by
`src/db/schema-parity.test.ts`):

- `src/db/klaussaContentActions.schema.ts` (`sqliteTable`)
- `src/db/pg/klaussaContentActions.schema.ts` (`pgTable`)

Columns (mirrors `actions.sqlite` almost exactly — that schema is
already proven correct through a real pilot and a real regression fix,
so this is a port, not a redesign):

| column | type | notes |
|---|---|---|
| `id` | text, PK | `crypto.randomUUID()` |
| `projectId` | text, not null | every other OpenSEO table is project-scoped; this one is too |
| `job` | text, not null | `'seo' \| 'geo'` |
| `runDate` | text, not null | |
| `clusterTopic` | text, not null | |
| `clusterKeywords` | text, not null | JSON array, stored as text (matches `actions.sqlite`'s own convention — no native JSON column type in SQLite, and the Postgres side stays textually identical per the parity test) |
| `sourcePageUrl` | text, nullable | |
| `targetPageUrl` | text, nullable | |
| `actionType` | text, not null | |
| `blogId` | text, not null | the upsert key (see §4) — unlike `actions.sqlite`'s auto-increment `id`, this table's natural unique key is `blogId`, since that's the one field every write already has and that uniquely identifies "this piece of content" |
| `blogUrl` | text, nullable | same value as `targetPageUrl` once known; kept as a separate column because `targetPageUrl` can be null before the blog's slug exists, while this is set at the same moment as `blogId` and never changes |
| `baselineMetrics` | text | JSON |
| `status` | text, not null | `'drafted' \| 'proposed' \| 'published' \| 'rejected' \| 'judged'` — one more state than `actions.sqlite`'s own enum, because the dashboard needs to show approval state directly rather than only learning it 14 days later when Step 0 runs. See §4 for exactly which check discovers and writes this. |
| `outcome` | text, nullable | `'improved' \| 'flat' \| 'worse'` — `rejected` is not a value here; it lives in `status`, per the Outcomes-tab decision (§6.4) that a rejected draft is a workflow event, not a performance result |
| `outcomeMetrics` | text, nullable | JSON |
| `indexedAt` | text, nullable | |
| `indexingLink` | text, nullable | the real `inspectionResultLink` from `inspect_urls`, stored at write time so the Overview tab never needs to re-call Google's API just to render a link it already has |
| `createdAt` | text, not null | |
| `judgedAt` | text, nullable | |

Index: `(projectId, status)` — every tab's query filters by project and
mostly by status.

Migration: `npm run db:generate` (generates both dialects), then
`wrangler d1 migrations apply DB --local` for the self-hosted D1
instance this project actually runs on.

## 4. MCP tool: `record_content_action`

New file `src/server/mcp/tools/record-content-action.ts`, following
`add-rank-tracking-keywords.ts`'s exact shape: plain-object Zod
`inputSchema`, `outputSchema` built with `optionalMetaOutputSchema`,
`annotations: {readOnlyHint: false, destructiveHint: false,
openWorldHint: false}`, `handler: withMcpProjectAuth(...)` calling a new
`ContentPipelineService.recordAction(...)`.

**Upsert-by-`blogId`**, mirroring `GscConnectionRepository.upsert`'s
established pattern exactly:
```ts
db.insert(klaussaContentActions)
  .values({ id: crypto.randomUUID(), projectId, ...input })
  .onConflictDoUpdate({
    target: klaussaContentActions.blogId,
    set: { ...input, updatedAt: sql`(current_timestamp)` },
  })
```
One call handles every lifecycle transition the cron already makes
locally (insert on draft, flip to `proposed` after the digest sends,
flip to `published`/`rejected`/`judged` later) — the cron always has the
full current row state in hand when it writes locally, so it always has
everything this tool needs too.

**Cron integration**: one line added next to each existing local
`actions.sqlite` write in `seo-geo-cron/prompts/seo.md` and `_common.md`
— call `record_content_action` with the same values immediately after
the local write succeeds. If the MCP call fails, log it to the research
log and continue — the dashboard mirror falling behind for one run is a
visibility gap, not a correctness one, since `actions.sqlite` remains
the cron's actual source of truth for its own decisions (per the
non-goals above). Never let a dashboard-sync failure block or roll back
the local write it's mirroring.

**Where the `published`/`rejected` transition specifically comes from**
— this needs its own line because it can't just piggyback on Step 0.
Step 0 only looks at rows 14+ days old, so waiting for it would mean
the dashboard shows `proposed` for up to two weeks after a human
actually approved something. Real approval/rejection happens inside
`blog-review-email` (a separate Worker) the moment a human clicks a
link — that Worker has no reason to learn about OpenSEO's MCP tools
just for this. Instead, reuse the **daily indexing-check step**
(`_common.md`, runs every day for SEO regardless of the 14-day gate):
it already does `GET /blogs/{blog_id}` for every row with a
`target_page_url` and no `indexed_at` yet, specifically to decide
whether there's anything to check indexing for. That same read already
tells it `published` vs. still `need_approval` vs. reverted to `draft`
— call `record_content_action` with the discovered status right there,
piggybacking on a check that already exists and already runs daily,
rather than adding a new read path or a new cross-Worker integration.
For GEO this update lands on GEO's own weekly cadence, matching how
fresh GEO's other dashboard data already is.

## 5. Backend service

`src/server/features/content-pipeline/services/ContentPipelineService.ts`
+ `.../repositories/ContentActionRepository.ts`, following the
`DashboardService`/`GscConnectionRepository` split (repository = raw
queries, service = the per-tab aggregation each server function needs).
Four methods, one per tab:

- `getOverview(projectId)` — funnel counts (all-time + last-7-days delta
  per stage) and the attention list (pending approvals, unindexed 2+
  days, recently judged).
- `getActions(projectId, filters)` — the Content Actions table, paged.
- `getKeywordCoverage(projectId)` — reads `rank-keywords.json`'s groups
  (already synced into OpenSEO's own rank tracker per this session's
  earlier work) cross-referenced against which keywords appear in any
  row's `clusterKeywords`.
- `getOutcomes(projectId)` — `status = 'judged'` rows only, with
  `baselineMetrics`/`outcomeMetrics` diffed for the CTR and position
  deltas the Outcomes tab shows side by side.

Each backed by a `createServerFn` in `src/serverFunctions/`, per
CLAUDE.md's server-function → service → repository convention.

## 6. Frontend: four tabs under "My Site" → "SEO Pipeline"

New route `content-pipeline`, feature code under
`src/client/features/content-pipeline/` — mirror `search-performance`'s
route-file placement exactly, the most structurally similar existing
"My Site" page.
Tabs use this codebase's existing tab pattern (`ResultsView.tsx`'s
`role="tablist"`/DaisyUI classes, active tab driven by a router search
param so each tab is a shareable/bookmarkable URL, not local
`useState`).

**Nav registration** (`src/client/navigation/items.ts`): one new entry
in `projectNavItems` (route `content-pipeline` or similar, label "SEO
Pipeline", a `lucide-react` icon — `GitBranch` or `Workflow` reads as
"pipeline" without clashing with `TrendingUp` already used for Rank
Tracking), then one more line in the "My Site" group's `items` array
(currently built from `search-performance`, `rank-tracking`, `saved`,
`audit`).

### 6.1 Overview

Funnel: tracked → drafted → published → indexed → judged, each stage
showing an all-time total with a "+N this week" delta beside it.
Attention list below: drafts still `need_approval`, published pages
unindexed 2+ days (each with its stored `indexingLink`, so this is the
first place a real "go nudge this" action surfaces), and outcomes
judged in roughly the last week.

*Objective: "what needs me right now, and roughly how big is this
getting" — the daily/weekly glance.*

### 6.2 Content Actions

One row per action: topic, keywords, job (SEO/GEO), status badge,
target URL (linked), indexed badge (with the nudge link inline if
unindexed 2+ days), outcome once judged. Filterable by status and job,
sorted newest first. Read-only — no row has an action button; every
real decision still happens via email or GSC.

*Objective: audit trail — "show me exactly what happened with X," not a
worklist to act from.*

### 6.3 Keyword Coverage

The tracked keyword set, grouped exactly like `rank-keywords.json`'s
own groups (`brand-defend`, `quick-win-striking-distance`,
`gap-not-ranking`, etc.), each keyword flagged acted-on or not (and
which action, if so). No position/volume column — a "View in Rank
Tracking" link per keyword (or per group) instead, so this tab never
drifts out of sync with the page that actually owns that data.

*Objective: backlog visibility — "how much of the tracked set is still
untouched, are we close to needing to re-seed."*

### 6.4 Outcomes

`status = 'judged'` rows only — `rejected` rows are workflow history,
not a performance result, so they stay in Content Actions and are never
counted here. Each row shows CTR and position movement side by side
(baseline → outcome), plus the `improved`/`flat`/`worse` verdict, with
an aggregate rate across all judged rows so far.

*Objective: "is this actually working" — the periodic strategic-review
tab, the one that answers whether the whole Class 2 effort is paying
off.*

## 7. Guardrails (restating what's already true elsewhere, for this
   feature specifically)

- This page never calls `inspect_urls`, GSC, or the blog API directly —
  it only reads what the cron already wrote via `record_content_action`.
  No new paid calls, no new live-data dependency at page-load time.
- The mirror write is best-effort. A missed sync degrades to "this row
  is stale on the dashboard until the next successful write for it,"
  never to "the cron's own decision-making saw wrong data" — the local
  `actions.sqlite` path is completely unaffected by whether the D1 write
  succeeds.

## 8. Open risks

- `blogId` as the upsert key assumes every row always has one by the
  time `record_content_action` is called. True today (the cron already
  requires a `blog_id` before it writes to `actions.sqlite` at all), but
  worth stating explicitly since it's a schema constraint, not just a
  convention.
- The Overview tab's "last 7 days" delta needs a consistent definition
  of "which timestamp column" per stage (e.g., is "drafted this week"
  keyed on `createdAt`, "indexed this week" on `indexedAt`, "judged this
  week" on `judgedAt`) — each stage's delta uses its own natural
  timestamp column, not a single shared one; worth being explicit about
  this in the implementation plan so it isn't decided ad hoc per query.
- Keyword Coverage's "acted-on" flag is computed by scanning every row's
  `clusterKeywords` JSON array for a match — fine at current scale
  (hundreds of rows, ~150 keywords), would need an indexed join table
  if either grows by an order of magnitude. Not a concern now; noted so
  it isn't silently forgotten later.
