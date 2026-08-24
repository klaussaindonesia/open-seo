# SEO/GEO Cron Worker — Design Spec

Date: 2026-08-20
Status: Approved for implementation (pending final review)

## 1. Context

Klaussa's SEO/GEO improvement work is split into two classes (see project memory
`project_klaussa_seo_geo`):

- **Class 1** (one-time fixes): done, merged to `klaussa_fe` staging.
- **Class 2** (continuous monitoring + agent-decided action): this spec.

OpenSEO (this repo, self-hosted at
`https://open-seo-selfhost.navigoinfo-id.workers.dev`) is the data source. It
has no built-in scheduling for its AI-search features and does not open PRs —
those are product decisions specific to Klaussa, not OpenSEO. This spec covers
a small, separate system that consumes OpenSEO's data and acts on it.

## 2. Goals / Non-goals

**Goals:**
- Continuously monitor klaussa.com's technical health, search rankings, and
  AI-citation visibility.
- Turn findings into one of three outcomes per the already-agreed action-space
  mapping: **auto-fix PR**, **content PR**, or **escalate (GitHub issue)** —
  plus an implicit **pass** when nothing warrants action.
- Run unattended, on a schedule, with no human in the loop per run.

**Non-goals:**
- Auto-merging anything. Every PR/issue waits for human review.
- Replacing OpenSEO's own product roadmap (native AI-search scheduling is
  OpenSEO's to build later; this spec's cron wrapper is a stopgap that also
  happens to carry Klaussa-specific decision logic OpenSEO shouldn't own).
- A generalized multi-tenant system. This is built for one project
  (klaussa.com) with hardcoded config, not a platform.

## 3. Architecture

Three independent, fully agentic cron jobs. Each is a single headless Claude
Code invocation (`claude -p "<job prompt>"`) with:
- MCP access to the `openseo` server (including two new tools added as part of
  this work — see §5).
- Bash/git/`gh` tool access to a persistent local clone of `klaussa_fe`.
- A job-specific prompt file describing the data to pull, the decision rules,
  and the guardrails (§7).

No bespoke orchestration code (no classifier, no PR-templating script) — the
agent performs data pull, classification, fix/draft, and execution in one
run. This matches the "agent-decided action" framing from the original
Class 2 brief and mirrors the existing precedent already running on the
target host (`0 9 * * * claude -p "System warmup."`).

```
autoseo/seo-geo-cron/
  prompts/
    technical-health.md
    seo.md
    geo.md
  data/
    geo-history.sqlite       # GEO history OpenSEO doesn't persist
  run.sh                     # cd autoseo && git pull -q && claude -p "$(cat prompts/$1.md)" ...
```

## 4. Execution host

Runs on `ez@100.120.136.18` (Tailscale alias `fiskal-vps`; actual machine:
desktop `ez-MS-iCraft-Z890-Arctic`), not a Cloudflare Worker — `gh`/git
operations need a real filesystem and git binary, which Workers don't have.

Verified present on that host: git 2.43, `gh` 2.45 (authenticated as
`eryawww`, `repo`+`workflow` scopes), node v22.22.1, Docker. **Missing:
pnpm** — needs `corepack enable` or install before `klaussa_fe` can be built
there.

Scheduling: plain **crontab**, matching the existing pattern on that host
(there is already one entry: a daily `claude -p` warmup job). No systemd
timers, no Docker — keep it consistent with what's already there.

Code sync: each run does `git -C ~/autoseo pull -q` before executing, so the
desktop always runs the latest committed version of the job prompts — no
separate deploy step for prompt/logic changes.

`klaussa_fe` workspace: a persistent local clone on the desktop
(`~/klaussa-lab/seo-geo-cron/klaussa_fe-workspace/`, gitignored from
`autoseo`). Each job run: `git pull origin main`, create/checkout a fresh
branch off `main`, make changes, commit, `git push -u origin <branch>`,
`gh pr create`.

## 5. New OpenSEO MCP tools (prerequisite)

Prompt Explorer and Brand Lookup are not exposed via MCP today — they're
TanStack `createServerFn` RPC endpoints (`src/serverFunctions/ai-search.ts`)
called only by the OpenSEO UI. The GEO job cannot function without MCP access
to them, so this spec includes adding two tools, following the exact pattern
`site-audit-tools.ts` already uses (`withMcpProjectAuth`, `mcpResponse`,
reusing existing Zod schemas):

**`explore_prompt`** — wraps `explorePrompt()` in
`src/server/features/ai-search/services/promptExplorer.ts`. Input: `prompt`,
`models` (1-4 of `chat_gpt`/`claude`/`gemini`/`perplexity`),
`highlightBrand`, `webSearch`. Output: per-model text, citations, and
whether the brand was mentioned.

**`lookup_brand`** — wraps `getBrandLookup()` in
`src/server/features/ai-search/services/brandLookup.ts`. Input: `query`
(brand/domain), `competitors` (up to 5), `locationCode`/`languageCode`.
Output: per-platform (ChatGPT US-only, Google AI Overview) mention counts and
competitor share-of-voice.

No other internal functions need tools of their own — both orchestrators
already encapsulate the full DataForSEO fan-out; exposing their internals
would just push classification work onto the agent for no benefit.

Both are billing-gate-free in self-hosted mode (`assertPaidPlan` only checks
`isHostedServerAuthMode()`), so no plan-gating code changes are needed.

Implementation: two new files under `src/server/mcp/tools/`
(`explore-prompt.ts`, `lookup-brand.ts`), two registrations in
`src/server/mcp/server.ts`, then `pnpm run deploy:selfhost --yes`.

## 6. Prerequisites not yet in place

- **Rank tracker is unconfigured** (`get_rank_tracker` returned empty
  `configs: []`, `list_saved_keywords` returned 0 rows) — the SEO job needs
  a seeded keyword list (competitors: Hukumonline, JDIH, Legalku; target
  keywords TBD from OpenSEO UI exploration) before it has anything to track
  drops against. This is separate follow-up work, not blocking the
  technical-health job.
- **GA4 has zero key events configured** — doesn't block any job (GSC + rank
  tracker are sufficient for the SEO job's decision rules), but means
  "does this content actually convert" stays unavailable until someone
  defines GA4 conversions.
- **GEO MCP tools don't exist yet** (§5) — blocks the GEO job specifically,
  not the other two.

## 7. Per-job specs

### 7.1 Technical Health

- **Cadence:** daily. Cost is trivial — DataForSEO On-Page API is
  $0.000125/page crawl + $0.00425/page Lighthouse; a 50-page/20-Lighthouse
  run (what we already ran manually) costs ≈$0.09, so daily ≈ $2.70/month.
  Caveat: DataForSEO pushed a pricing update 2026-07-01; Lighthouse's
  post-update price wasn't confirmed by search — verify against a real
  invoice after the first week of runs.
- **Data:** `run_site_audit` (maxPages 50, Lighthouse on) → poll
  `get_audit_status` → `get_audit_issues`.
- **Decision rules** (already agreed in the Class 2 action-space mapping):
  - Broken links / meta / alt / templated schema gaps → **auto-fix, open
    PR**.
  - Novel-type schema gaps, Core Web Vitals regressions, server errors
    (5xx), anything outside the allowed-path guardrail → **escalate
    (GitHub issue)**.
  - Everything else (info-level cosmetic issues with no clear fix) → pass.
- **Reference case** (real audit run 2026-08-19,
  `auditId f0e2dee4-a6d5-45da-999a-e664ede5b5bc`): 62 broken-internal-link +
  6 broken-page issues collapsed to 3 repeated dead nav/footer targets
  (`/account`, `/business`, `/regulation-canvas`) — auto-fix case. 17×
  503 errors + 20/20 failed Lighthouse checks on `/peraturan/*` routes,
  correlated with response times up to 10.7s — escalate case (real backend
  perf issue, not a content/link fix).

### 7.2 SEO

- **Cadence:** weekly (Monday). GSC/rank-tracker data doesn't move
  meaningfully day-to-day; weekly bounds DataForSEO keyword-research spend
  too.
- **Data:** rank tracker history (once seeded, §6) + `get_search_console_performance`
  (free, first-party) + optionally `get_google_analytics_organic_overview`
  for conversion context.
- **Decision rules** (already agreed):
  - Drop in position → check site-audit for a technical cause first (cross-
    reference the technical-health job's latest findings), else refresh
    content.
  - Ranking but no snippet (low CTR at position where a snippet is
    plausible) → add a direct-answer/FAQ block.
  - Competitor outranks us → diff the competitor's page vs. ours, write a
    content brief.
  - High-volume keyword we don't rank for at all → draft a new post/hub
    page.
  - All content actions are delivered as a **draft PR with the actual
    written content** (not just a brief) — human reviews/QAs before merge.
- **Reference case**: current GSC data already shows striking-distance
  keywords (position 4-15, real impressions, 0% CTR) — e.g. "sk kemenkumham"
  (463 impressions, position 5.9, 2 clicks), "registered" (237 impressions,
  position 8.5, 1 click). These are immediately actionable once this job
  exists.

### 7.3 GEO

- **Cadence:** weekly (staggered an hour after the SEO job, to bound
  concurrent DataForSEO LLM-call load).
- **Data:** `explore_prompt` + `lookup_brand` (new tools, §5) against a
  target prompt set (the ~50-prompt ID-language list mentioned in the
  original handoff — not yet finalized, needs the same keyword-scoping
  session as §6) and named competitors.
- **Persistence:** local SQLite (`data/geo-history.sqlite`) on the desktop
  host, since OpenSEO doesn't store this. Schema: one row per
  `(run_date, prompt_or_query, model/platform, cited: bool,
  competitor_cited: bool, share_of_voice_pct)` — enough to detect trend
  (share-of-voice dropping across runs) without needing a full history API.
- **Decision rules** (already agreed):
  - We're cited → reinforce that page (low-priority content PR touching the
    cited page).
  - Competitor cited, we're not → **highest-priority** content PR (diff
    competitor's cited page vs. ours).
  - We're cited with wrong/outdated info → **escalate immediately**, no
    auto-fix (factual correctness needs a human).
  - Share-of-voice trending down across runs (requires ≥2 prior SQLite
    rows for the same prompt/query) → escalate as a digest, no auto-fix
    (root cause usually spans more than one page).
  - Zero citations for anyone on a prompt → pass, deprioritize.

## 8. Guardrails

Every job runs unattended with real write access to `klaussa_fe` and
`gh`/GitHub issue-creation rights. Guardrails, enforced via explicit
instructions in each job's prompt file:

- Never force-push. Never merge its own PR — PRs/issues always wait for
  human merge/close.
- Branch naming: `self-heal-<job>-<YYYYMMDD>` (technical-health),
  `content-<job>-<slug>-<YYYYMMDD>` (content jobs).
- Technical-health may only touch files matching the auto-fixable issue
  types it found (nav/footer link targets, `<title>`/meta tags) — never
  touch auth, billing, CI/workflow, or schema/migration files even if it
  believes it found a bug there; escalate instead.
- Content jobs only add new files under a content directory — never edit
  existing published page content directly.
- Cap: max 1 PR **and** max 1 issue per job per run — a bad classification
  run can't spam multiple PRs/issues.
- Every PR/issue body must cite which OpenSEO data it acted on (audit ID,
  rank-tracker snapshot date, GSC date range, GEO run date) for
  traceability back to the source data.
- Escalation issues: `gh issue create --repo <org>/klaussa_fe --label
  seo-geo-escalation`.
- Content PRs: opened as drafts (`gh pr create --draft`), so nothing merges
  without explicit promotion out of draft by a human.

## 9. Rollout plan

1. Implement + deploy the two new MCP tools (§5); redeploy OpenSEO
   self-host.
2. Set up the desktop host: install pnpm, clone `klaussa_fe` into the
   workspace dir, verify `gh`/git auth.
3. Seed the rank tracker + GEO prompt set (separate short session in the
   OpenSEO UI — competitors and keyword list still need finalizing, §6).
4. Write the three job prompt files in `autoseo/seo-geo-cron/prompts/`.
5. Add the three crontab entries; run each manually once first
   (`./run.sh <job>`) to sanity-check before trusting the schedule.
6. Monitor the first 1-2 weeks of real runs — check DataForSEO actual spend
   against the estimate, check PR/issue quality, tighten guardrails/prompts
   as needed.

## 10. Open risks

- Guardrails live in a prompt file, not code — an agent can in principle be
  argued out of a prompt-level constraint. Acceptable for v1 given the "max
  1 PR/issue per run" cap and required human review before merge, but worth
  revisiting if a run ever does something the prompt explicitly forbade.
- GEO prompt set and rank-tracker keyword list are still unscoped —
  placeholder in this spec, blocking §7.2/§7.3 from being fully actionable
  until that's done.
- DataForSEO Lighthouse pricing post-2026-07-01 update not independently
  confirmed — verify against real billing before locking in daily cadence
  long-term.

## 11. Addendum (2026-08-24): content publishing is not a git PR

§7.2/§7.3 and §8 above describe content actions (SEO/GEO) as a file-based
draft PR against `klaussa_fe`. A pilot run of the SEO job found this is
wrong: `klaussa_fe`'s blog is DB-backed (Supabase `blogs` table via
`api.klaussa.com`), authored through an admin UI — there is no
content/blog directory in the repo to add a file to
(`klaussaindonesia/klaussa_fe#1278`).

The actual mechanism, implemented and verified end-to-end against
production:

- A **WRITER**-role Supabase bot account (`seo-geo-writer-bot@klaussa.com`)
  creates the post via `POST /api/v1/blogs` with `status: "need_approval"`.
  This role can author but is **not** in `BLOG_ROLES_CAN_APPROVE` — calling
  `/blogs/{id}/approve` with this account returns 403, confirmed live. The
  cron job never holds a credential capable of publishing.
- The job then POSTs an HMAC-signed intake to a new, separate Cloudflare
  Worker, `klaussa-lab/blog-review-email`
  (`https://blog-review-email.navigoinfo-id.workers.dev`), mirroring
  `email-service`'s proven magic-link pattern (HMAC-signed nonce URLs,
  Cloudflare Email Send on the same `news.klaussa.com` domain) but scoped
  to single-post approve/reject instead of digest fan-out — deliberately
  a separate, smaller Worker rather than extending the live digest
  pipeline's Supabase-backed state machine (different domain: no grace
  period, no fan-out, no `kind` discriminator needed).
- That worker emails the human a green **Approve & Publish** / red
  **Reject** button pair. Approve calls `/blogs/{id}/approve` using a
  second, separate **APPROVER**-role bot account
  (`seo-geo-approver-bot@klaussa.com`) whose credential lives only in the
  worker's Cloudflare secrets — never in the cron job's environment.
  Reject `PATCH`es the post back to `status: "draft"` (non-destructive,
  same semantics as the digest worker's own reject).
- This is a **structural**, not prompt-level, guardrail: even if the cron
  agent were instructed or tricked into trying to publish directly, its
  own bot account has no permission to do so.

This changes §8's "Content jobs only add new files under a content
directory" bullet: content jobs never touch `klaussa_fe` via git at all.
The branch-naming guardrail (`content-<job>-<slug>-<YYYYMMDD>`) is now
moot for content actions and applies to none of the three jobs (Technical
Health still uses `self-heal-<job>-<YYYYMMDD>` for its git/PR flow,
unchanged). Job prompts (`seo-geo-cron/prompts/{seo,geo}.md`) have been
updated accordingly; required secrets
(`WRITER_EMAIL`/`WRITER_PASSWORD`/`BLOG_REVIEW_HMAC_SECRET`/etc.) are
documented in `seo-geo-cron/.env.local.example`.
