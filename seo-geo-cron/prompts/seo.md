# SEO job

Daily. Turns ranking and search-console data into up to 5 content
actions, delivered as one digest email.

## What to do

0. **Outcome tracking first.** Follow `_common.md`'s "Outcome tracking"
   section — check and judge any of your own (`job='seo'`) past actions
   that are due, before anything else below.
1. `get_rank_tracker` for tracked positions and history. If `configs` is
   empty no tracker exists yet — escalate once with "[SEO/GEO] rank
   tracker not configured" (check the issue does not already exist
   first), then continue with the GSC-only analysis below.
2. `get_search_console_performance` (`dateRange: "last_28_days"`,
   dimensions `["query"]` and `["page"]`). Free — use it every run.
3. Optionally `get_google_analytics_organic_overview` for traffic trend
   (free).

## Finding today's opportunities

Build one candidate list from all four decision rules below, across
every signal source, then take the top 5 by priority. Never stop at the
first match — that was last week's behavior; daily cadence means walking
every rule to see the full picture, then picking the strongest 5.

Read `current_goal` from context first — it names the specific thing this
POC is trying to move, and that outranks generic best practice.

1. **Rule 1 candidates (highest priority): a key page ranks well but
   converts badly.** Scan `keyPages` from context against fresh GSC data
   for pages at position 4-15 with CTR under ~2% — each qualifying page
   is one candidate, already page-level, no grouping needed. This is the
   highest-value action for klaussa.com: the blog draws ~1.6x the
   impressions of the regulation pages and converts them at about a
   fifth of the rate. `keyPages` records measured CTR per page — compare
   against the best-converting page in that list to see what "good"
   looks like on this site.
2. **Rule 2 candidates: position dropped vs. the prior period.** Any
   tracked keyword with a real position drop vs. the prior rank-tracker
   snapshot is one candidate. Check the technical-health job's latest
   audit (`get_audit_issues`, no auditId = latest, free) for a technical
   cause on that page before assuming it is a content problem — if
   there is one, note the correlation rather than re-diagnosing it.
3. **Rule 3/4 candidates: cluster-then-cap.** Rules 3 (a competitor
   outranks us) and 4 (a high-volume keyword we do not rank for at all)
   both source from `rank-keywords.json`'s tracked keyword groups, which
   is where raw keyword strings need grouping into real page-level
   opportunities before they're comparable to rules 1-2's candidates:

   a. Read `quick-win-striking-distance` → `gap-not-ranking` →
      `high-volume-deep` in that priority order.
   b. Query `actions.sqlite` for every keyword already covered by any
      past `seo` row (`SELECT cluster_keywords FROM actions WHERE
      job='seo'`, union the JSON arrays). Drop those keywords from each
      group.
   c. Group what's left by topic — judgment, not string matching. Two
      keywords belong in one cluster only if a single page/section could
      fully answer both without duplicating content elsewhere.
      Calibration (apply this bar consistently, not looser or tighter
      than these examples):
      - Same cluster: "perbedaan mk dan ma" / "kewenangan mk" / "tugas ma
        dan mk" / "tugas mahkamah agung dan mahkamah konstitusi" (MK vs
        MA authority — no shared root word beyond "mk"/"ma", still one
        topic).
      - Same cluster: "sp-1 adalah" / "sp 1 adalah" / "sp 3 adalah"
        (employee warning letters).
      - Same cluster: "apa itu trademark" / "trade mark artinya" (same
        topic despite sharing no substring).
      - Not the same cluster: "hak dpr" and "kode etik profesi" — both
        generic legal terms, unrelated topics.
   d. For `quick-win-striking-distance` clusters: check whether a
      competitor outranks us there (rule 3) — Competitors come from
      `get_project_context`, not a hardcoded list, and the SERP itself
      may show others you were not told about. Fetch their ranking page,
      diff against ours. If no clear competitor gap, it's still a
      legitimate "already ranking, could rank higher" candidate. For
      `gap-not-ranking`/`high-volume-deep` clusters: these are rule 4 by
      definition (we don't rank at all, or rank past position 40) — draft
      a new page. Lowest priority: strengthening a page that already
      ranks beats starting from zero.
   e. Each resulting cluster is one candidate.

## Ranking and capping

Combine every candidate from rules 1-4 above into one list. Rank: rule 1
> rule 2 > rule 3 > rule 4 (matches the priority order above); within a
tier, by the size of the opportunity (impressions/CTR gap for rules 1-2,
summed `opp` score from `rank-keywords.json`'s `metrics` for rules 3-4).
Take the top 5.

Fewer than 5 genuine candidates across all four rules → do fewer. Never
pad with a 6th lower-value or single-keyword action to hit the cap —
append a note to the research log flagging the pool is thinning instead.

## Publishing: draft all chosen candidates, then send one digest

Blog content is DB-backed (Supabase via `api.klaussa.com`), not files in
`klaussa_fe` — there is no repo to PR for a blog post. Required env vars
are already exported by `run.sh`; read them from the environment, never
print them.

Follow `writing_preferences` from context — it is binding, not advisory.

Sign in as the writer bot once (it cannot publish, by design):
```bash
TOKEN=$(curl -s -X POST "$BACKEND_URL/api/v1/auth/sign-in" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$WRITER_EMAIL\",\"password\":\"$WRITER_PASSWORD\"}" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['session']['access_token'])")
```

For **each** of the up to 5 chosen candidates, in order:

1. Create the draft. `content` is a Tiptap JSON doc, not markdown:
   `heading` nodes (`"attrs":{"level":2}`) for section titles, `paragraph`
   nodes for body. Always `"status":"need_approval"` — never `draft`
   (invisible to the reviewer) or `published` (you cannot set it anyway).
   ```bash
   BLOG=$(curl -s -X POST "$BACKEND_URL/api/v1/blogs" \
     -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
     -d '{"title":"...","content":{...},"status":"need_approval","tags":["seo"]}')
   BLOG_ID=$(echo "$BLOG" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
   ```
2. Immediately record it — do not wait until all candidates are drafted:
   ```bash
   sqlite3 seo-geo-cron/data/actions.sqlite "INSERT INTO actions
     (job, run_date, cluster_topic, cluster_keywords, target_page_url,
      action_type, blog_id, baseline_metrics, status, created_at)
     VALUES ('seo', date('now'), '<topic>', '<json array of keywords>',
      <'target url' or NULL>, '<edit-existing|new-page|faq-block>',
      '$BLOG_ID', '<json baseline metrics>', 'drafted', datetime('now'));"
   ```
   Writing this immediately after each draft — not batched at the end —
   means an interrupted run never leaves a drafted-but-unrecorded item
   that tomorrow's exclusion set (rule 3/4 step b above) would miss.

Once every chosen candidate has a draft and an `actions.sqlite` row, send
**one** digest covering all of them. HMAC-sign the batched body:
```bash
TS=$(date +%s)
BODY=$(python3 -c "
import json
items = [
  {'blog_id': '<blog_id_1>', 'title': '<title_1>', 'summary': '<summary_1>'},
  # ... one entry per candidate actually drafted this run
]
print(json.dumps({'items': items,
  'admin_url': 'https://klaussa.com/blogs/dashboard',
  'to': '$BLOG_REVIEW_RECIPIENT'}))
")
SIG=$(printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "$BLOG_REVIEW_HMAC_SECRET" -r | awk '{print $1}')
curl -s -X POST "$BLOG_REVIEW_WORKER_URL/internal/blog-proposal" \
  -H "Content-Type: application/json" \
  -H "X-Klaussa-Signature: sha256=$SIG" -H "X-Klaussa-Timestamp: $TS" \
  -d "$BODY"
```
The worker renders each item's full draft into the email, so each
summary is context for that item's decision, not a substitute for the
content.

**If this call fails** (non-2xx, or no response): escalate once, titled
"[SEO/GEO] digest send failed — N drafts orphaned", listing every
`blog_id` drafted this run. Do not leave them unrecorded and unreachable
— they are already in `need_approval` with no email pointing at them.

**On success**, flip every row drafted this run from `drafted` to
`proposed`:
```bash
sqlite3 seo-geo-cron/data/actions.sqlite "UPDATE actions SET status='proposed'
  WHERE job='seo' AND run_date=date('now') AND status='drafted';"
```

Then stop. A human decides from the email. Do not poll for their
decision.

## After acting

For each candidate acted on, add a short `appendResearchLog` entry naming
the page/topic and the keyword cluster, so tomorrow's run can see what
was already attempted without needing to open the SQLite file.
