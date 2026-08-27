# SEO/GEO Velocity & Outcome Tracking — Design Spec

Date: 2026-08-27
Status: Approved for implementation
Supersedes/amends: `2026-08-20-seo-geo-cron-design.md` §7.2 (SEO), §7.3 (GEO),
§8 (guardrails: per-job PR/content cap)

## 1. Context

The SEO and GEO cron jobs (see `2026-08-20-seo-geo-cron-design.md`) have run
real pilots: Technical Health, SEO, and GEO all completed end-to-end,
including one real published post. Each pilot was capped at **one** content
draft per run, and SEO/GEO both ran **weekly**.

That cadence is too slow for the goal: capture ranking/citation opportunity
before it's stale, across a keyword set that was just re-sorted to surface
~150k/mo of tracked demand (see `rank-keywords.json`). The user wants
faster iteration — explicitly, ~5 blog proposals/day from SEO — without
reintroducing two problems already identified and rejected earlier this
session:

- **Literal one-keyword-one-blog** causes keyword cannibalization. Several
  tracked keywords are the same topic worded differently (e.g. "sp-1
  adalah" / "sp 1 adalah" / "sp 3 adalah"); mapping each to its own page
  competes against itself instead of building one page's authority.
- **Unbounded volume** overwhelms the one thing that can't scale
  automatically: a human verifying legal accuracy before publish. Today's
  SEO pilot declined to assert renumbered pasal citations without
  verification — that check doesn't get faster by drafting more content,
  and Google's spam/helpful-content systems specifically target
  mass-produced near-duplicate pages on YMYL domains.

This spec designs three things: how a run finds *N distinct* opportunities
instead of one, a structured record of whether a past action actually
worked, and how N drafts reach the reviewer as one digest instead of N
separate emails.

## 2. Goals / Non-goals

**Goals:**
- SEO: up to 5 content actions/day (was 1/week). GEO: up to 2/week (was
  1/week) — GEO's citation-gap signal refreshes weekly, not daily, so its
  cap stays modest.
- Never target the same page/topic twice without a documented reason.
- Every content action's baseline is recorded, and re-checked once, so a
  later run can tell whether it worked instead of guessing.
- One email per run, regardless of how many items it contains.
- Re-seeding the keyword set (already an established practice — done twice
  this session) requires zero changes to this design. Nothing here is a
  static, hand-curated list that goes stale.

**Non-goals:**
- Any change to `rank-check.md`'s DataForSEO-metered cadence, or to
  `explore_prompt`/`lookup_brand`'s call volume. This spec only touches
  free tools (GSC, GA4, audit reads, blog API) and content drafting, both
  already $0 against the DataForSEO budget.
- Merging SEO's and GEO's digests into one email. Different schedules,
  different job types — kept as two independent digests.
- Automating Google indexing requests. Checked: Google's sitemap-ping is
  deprecated, the Indexing API is restricted to JobPosting/BroadcastEvent
  content, and IndexNow doesn't cover Google. The existing sitemap
  infrastructure (`sitemap-blog.xml.ts`, 6h cache, real `lastmod`) already
  signals freshness; the human will use GSC's manual "Request Indexing"
  after approving.
- Retrying a `judged: worse` or `judged: flat` cluster automatically. That's
  a deliberate human call (try a different angle), not something the job
  decides on its own.

## 3. Opportunity discovery: cluster-then-cap

No persisted cluster list, no separate clustering script. Computed fresh at
the start of every run, so re-seeding `rank-keywords.json` needs no
follow-up step — new keywords simply become clusterable candidates the next
time they appear un-excluded.

1. Read `rank-keywords.json`'s `quick-win-striking-distance` →
   `gap-not-ranking` → `high-volume-deep` groups, in that priority order
   (matches the file's existing priority ordering and `seo.md`'s existing
   decision-rule order).
2. Read `actions.sqlite` (§4). Build one exclusion set: every keyword
   already covered by *any* past row, regardless of outcome.
3. Drop excluded keywords from each group.
4. Group what's left by topic, using judgment rather than string
   similarity — string matching fails here (e.g. "apa itu trademark" and
   "trade mark artinya" share no substring but are the same topic). Two
   keywords belong in one cluster only if a single page/section could
   fully answer both without duplicating content elsewhere. Calibration
   examples, embedded directly in `seo.md` so every run applies the same
   bar:
   - Same cluster: "perbedaan mk dan ma" / "kewenangan mk" / "tugas ma dan
     mk" / "tugas mahkamah agung dan mahkamah konstitusi" (MK vs MA
     authority — one topic, no shared root word beyond "mk"/"ma").
   - Same cluster: "sp-1 adalah" / "sp 1 adalah" / "sp 3 adalah" (employee
     warning letters).
   - Not the same cluster: "hak dpr" and "kode etik profesi" — both
     generic legal terms, unrelated topics.
5. Rank clusters: quick-win first (existing page, fastest to re-crawl —
   see §6), then gap, then high-volume-deep; within a tier, by summed
   `opp` score (already computed per-keyword in `rank-keywords.json`'s
   `metrics`).
6. Take the top N (5 SEO / 2 GEO). Fewer clusters available than N → do
   fewer. No padding with lower-value or single-keyword content to hit
   the cap.

Rough current scale (computed by hand against today's keyword set, for
calibration, not as a persisted artifact): ~32 distinct opportunities in
quick-win-striking-distance, ~16 in gap-not-ranking — about 48 total, which
at 5/day is roughly a 10-day backlog before re-seeding is needed.

## 4. Outcome tracking: `actions.sqlite`

New file, `seo-geo-cron/data/actions.sqlite` (gitignored, same pattern as
the existing `geo-history.sqlite` — kept as a **separate** file, since
`geo-history.sqlite` tracks per-(prompt, model) citation results for
share-of-voice trend analysis, a different concern from content-action
outcomes).

Single table, shared by both jobs (`job` column distinguishes):

| column | notes |
|---|---|
| `id` | primary key |
| `job` | `seo` \| `geo` |
| `run_date` | date the action was taken |
| `cluster_topic` | human-readable label, e.g. "MK vs MA authority" |
| `cluster_keywords` | JSON array of the specific keywords covered |
| `target_page_url` | the page being edited, or null for a new page |
| `action_type` | free text: `edit-existing`, `new-page`, `faq-block`, `citation-gap-fix`, etc. |
| `blog_id` | set once the draft is created |
| `baseline_metrics` | JSON: `{position, ctr, impressions, clicks, measured_at}` |
| `status` | `drafted` → `proposed` → `judged` |
| `outcome` | null until judged: `improved` \| `flat` \| `worse` |
| `outcome_metrics` | JSON, same shape as baseline, null until judged |
| `created_at`, `judged_at` | |

**Step 0 of every run** (before opportunity discovery, §3): for any row
**where `job` matches the running job** (SEO only checks its own `seo` rows,
GEO only its own `geo` rows — the table is shared for storage convenience,
not cross-job review) with `status = proposed` and `run_date` ≥14 days ago,
`GET /blogs/{id}`
(free, read-only — this is a fresh read on a new run, not polling within a
run, so it doesn't violate the single-shot guardrail):

- Still `need_approval` after 14+ days → escalate once, naming the
  blog_id. Sitting unreviewed for two weeks is itself a signal worth
  surfacing, not something to keep silently re-checking.
- `published` → pull fresh GSC metrics for `target_page_url`, compare to
  `baseline_metrics`, classify as `improved` / `flat` / `worse` (guideline,
  not a rigid formula — meaningful position or CTR movement, judged the
  same way the existing decision rules already use soft thresholds like
  "CTR under ~2%"), write `outcome`/`outcome_metrics`, set
  `status = judged`.
- `rejected`/reverted to `draft` → set `status = judged`, `outcome =
  rejected` (excluded from future re-targeting same as any other judged
  row, per the no-auto-retry non-goal above).

Only after Step 0 completes does the run spend its cap (§3) on new
clusters.

**Why 14 days, one fixed number for every action type**: edits to
already-ranking pages typically re-crawl and re-rank faster than brand-new
URLs (see §6), which would argue for two different windows — but a single
number was chosen deliberately to keep the logic simple, at the cost of
occasionally judging a slower-moving new page a little early.

## 5. Digest batching

Both jobs already have a proven, working single-item flow: writer-bot
creates a draft, an HMAC-signed intake POST triggers one email with a full
rendered draft and Approve/Reject buttons, approver-bot executes the
decision. This spec batches the *email*, not the underlying approve/reject
mechanism.

**Per-run flow:**
1. Loop the top N clusters from §3: run the existing decision-rule logic,
   create the Tiptap draft (`POST /blogs`, `status: need_approval`), write
   the `actions.sqlite` row immediately with `status = drafted`.
2. After the loop, make **one** HMAC-signed intake call bundling all N
   items: `{items: [{blog_id, title, summary}, ...], admin_url, to}`.
3. On success, flip all N rows to `status = proposed`.
4. On failure, escalate **once**, listing every orphaned `blog_id` from
   this run, instead of leaving `need_approval` drafts that nothing will
   ever surface (tomorrow's exclusion set in §3 would otherwise hide them
   forever, since their keywords are already "covered").

**`blog-review-email` worker changes** (the only infrastructure this
touches — `store.ts`, `hmac.ts`, and the `/action` click-handler are
**unchanged**, since approve/reject already key off `blog_id` + token,
independent of how many items arrived in one email):
- `router.ts`: intake body changes from one blog to
  `{items: [...], admin_url, to}`; loops `getBlogForReview()` per item.
- `approval_email.ts`: new digest template — full rendered content per
  item (keeps the earlier "show real content, not just a summary" fix),
  each item with its own independent Approve/Reject link pair, so
  approving item 2 and rejecting item 4 out of one digest needs no new
  state machine.

SEO's daily digest and GEO's weekly digest remain **separate** emails —
different jobs, different schedules, not merged.

## 6. Indexing speed (context for §3's ranking and §4's window)

Checked directly against `klaussa_fe` and current Google/Bing mechanisms,
since this sets real expectations rather than an assumption:

- Google's sitemap-ping endpoint: deprecated (retired 2023).
- Google's Indexing API: restricted to JobPosting/BroadcastEvent structured
  data — not usable for blog content.
- IndexNow: free, instant, but Bing/Yandex only. Google has never joined
  it.
- `klaussa_fe` has no active indexing-acceleration mechanism today — only
  passive sitemaps (`sitemap-blog.xml.ts`, `sitemap-peraturan-*.xml.ts`,
  both with accurate `lastmod`, 6h cache).
- The one thing that reliably speeds up Google's re-crawl: a page already
  linked from an authoritative, frequently-crawled page. `/blog` and
  `/peraturan` hub pages already provide this automatically for both new
  posts and edits — no new internal-linking automation needed.
- The user will use GSC's manual "Request Indexing" (rate-limited ~10/day,
  a real human action) after approving — not automated by this design.

Net effect: edits to already-indexed, already-ranking pages (quick-win
group) get re-crawled and re-ranked meaningfully faster than brand-new
URLs. This is already why quick-win ranks first in §3 step 5; this section
is why.

## 7. Guardrail changes to `_common.md`

Current: "Max **one** PR/content draft and **one** escalation issue per
run" (shared across all jobs).

New: the content-draft cap becomes per-job (SEO: 5, GEO: 2), delivered as
one digest per run regardless of item count (§5). The escalation cap
**stays at one per run** for both jobs — raising content volume doesn't
change how many genuinely-needs-a-human findings a run should surface at
once.

## 8. Cron schedule changes

| Job | Before | After |
|---|---|---|
| `technical-health` | daily | unchanged |
| `rank-check` | daily | unchanged |
| `seo` | weekly (Mon) | **daily** |
| `geo` | weekly (Mon) | unchanged (weekly) |

## 9. Backlog exhaustion

When §3 finds fewer than N clusters, the run does less — it does not pad
with lower-value or literal one-keyword-one-blog content to hit the cap. It
appends a note to the OpenSEO research log flagging the pool is thinning.
Re-seeding `rank-keywords.json` stays a human-initiated action (as done
twice already this session), not an autonomous "buy more keyword research"
loop — DataForSEO spend for keyword research stays a deliberate decision,
not something a daily cron job triggers on its own.

## 10. Files touched

- `seo-geo-cron/prompts/_common.md` — guardrail cap change (§7).
- `seo-geo-cron/prompts/seo.md` — cluster-then-cap algorithm (§3), Step 0
  outcome-check (§4), digest loop (§5).
- `seo-geo-cron/prompts/geo.md` — same, with GEO's own opportunity source
  (citation gaps from that week's prompt sweep) substituted for §3's
  keyword groups, cap 2.
- New: `seo-geo-cron/data/actions.sqlite` schema (created on first run,
  gitignored).
- `klaussa-lab/blog-review-email/src/router.ts`,
  `klaussa-lab/blog-review-email/src/approval_email.ts` — digest support
  (§5). `store.ts`, `hmac.ts`, action-handler: unchanged.
- Crontab (§8): SEO entry moves from weekly to daily.

## 11. Open risks

- The 14-day fixed window (§4) will occasionally judge a brand-new page's
  outcome before Google has fully settled its ranking — accepted
  explicitly in exchange for simpler logic, per the user's stated
  preference.
- Cluster-then-cap's topic-grouping judgment (§3 step 4) runs fresh every
  day with no persisted state to check consistency against — a keyword
  could in principle be grouped slightly differently on different days if
  it's genuinely ambiguous. The embedded calibration examples bound this,
  but don't eliminate it. Worth revisiting if a real run produces a
  surprising grouping.
- Digest batching (§5) trades per-item durability for one email: an
  interruption after drafting but before the digest send is now handled by
  escalation (step 4) rather than the previously-simpler "each item is
  independently already sent." This is a real, if rare, new failure mode
  worth watching in the first few weeks of daily SEO runs.
