# SEO job

Daily. Turns ranking and search-console data into up to 5 content
actions, delivered as one digest email.

## What to do

0. **Outcome tracking first.** Follow `_common.md`'s "Outcome tracking"
   section — check and judge any of your own (`job='seo'`) past actions
   that are due, before anything else below. If a due row's judgment
   needs fresh GSC and GSC is currently unavailable (see step 2's
   fallback below), skip judging that row this run — leave it
   `proposed` and try again next run. Never write a judgment from
   incomplete data.
1. `get_rank_tracker` for tracked positions and history. If `configs` is
   empty no tracker exists yet — escalate once with "[SEO/GEO] rank
   tracker not configured" (check the issue does not already exist
   first), then continue with the GSC-only analysis below.
2. `get_search_console_performance` (`dateRange: "last_28_days"`,
   dimensions `["query"]` and `["page"]`). Free — use it every run. **If
   this call fails** (down, reconnect-required, or any error): do not
   fall back to stale cached data for rules 1/2 below — they produce
   zero candidates this run instead. Rely on rules 3/4 (local
   `rank-keywords.json`, unaffected by a Google outage). If this is the
   reason a run drafts fewer than 5, say so in the research log entry
   rather than silently drafting less.
3. Optionally `get_google_analytics_organic_overview` for traffic trend
   (free) — same fallback as step 2 if it fails.

## Finding today's opportunities

Build one candidate list from all four decision rules below, across
every signal source, then take the top 5 by priority. Never stop at the
first match — that was last week's behavior; daily cadence means walking
every rule to see the full picture, then picking the strongest 5.

**Before scanning any rule, build one exclusion set — this applies to
every rule below, not just rules 3/4:**
```sql
SELECT source_page_url, cluster_keywords FROM actions WHERE job='seo';
```
Collect every non-null `source_page_url` into an excluded-source-URL
set, and union every `cluster_keywords` JSON array into an
excluded-keyword set. Use `source_page_url` here, never
`target_page_url` — `target_page_url` is always the *new* companion
page an action produced (see Publishing below), so it can never match
an existing page you're scanning for candidates; `source_page_url` is
the existing page that made a past run consider a candidate in the
first place, which is exactly what this exclusion needs to recognize. A
page or keyword already acted on — at any status, `drafted`,
`proposed`, or `judged` — is off the table for every rule until a
human's outcome judgment decides it needs a different angle (see
`_common.md`'s Outcome tracking). This is not optional per-rule
behavior; it is the one gate every candidate below must pass before it
counts.

Read `current_goal` from context first — it names the specific thing this
POC is trying to move, and that outranks generic best practice.

1. **Rule 1 candidates (highest priority): a key page ranks well but
   converts badly.** Scan `keyPages` from context against fresh GSC data
   for pages at position 4-15 with CTR under ~2%, **skipping any page
   already in the excluded-source-URL set built above** — each remaining
   qualifying page is one candidate, already page-level, no grouping
   needed. This is the highest-value action for klaussa.com: the blog
   draws ~1.6x the impressions of the regulation pages and converts them
   at about a fifth of the rate. `keyPages` records measured CTR per
   page — compare against the best-converting page in that list to see
   what "good" looks like on this site.
2. **Rule 2 candidates: position dropped vs. the prior period.** Any
   tracked keyword with a real position drop vs. the prior rank-tracker
   snapshot is one candidate, **skipping any page already in the
   excluded-source-URL set**. This only produces candidates on a run following
   a genuinely *new* tracker snapshot — the rank-tracker cadence is 2x
   weekly in month 1 and biweekly after (`budget.json`), so
   `previousPosition == position` for every keyword on most days is
   expected, not a failure; it means no new snapshot has landed since
   the last check, and this rule correctly yields nothing. Check the
   technical-health job's latest audit (`get_audit_issues`, no auditId =
   latest, free) for a technical cause on that page before assuming it
   is a content problem — if there is one, note the correlation rather
   than re-diagnosing it.
3. **Rule 3/4 candidates: cluster-then-cap.** Rules 3 (a competitor
   outranks us) and 4 (a high-volume keyword we do not rank for at all)
   both source from `rank-keywords.json`'s tracked keyword groups, which
   is where raw keyword strings need grouping into real page-level
   opportunities before they're comparable to rules 1-2's candidates:

   a. Read `quick-win-striking-distance` → `gap-not-ranking` →
      `high-volume-deep` in that priority order.
   b. Drop every keyword already in the excluded-keyword set built
      above.
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

**What actually gets built, for every rule.** The writer bot can only
create new posts — it never edits an existing page, by design (editing a
live page would be publishing a change without human approval). So
every action below, regardless of which rule produced the candidate, is
a **new companion post** — never an edit to the page that inspired it.
Two different URLs go in two different columns — do not merge them:
- `target_page_url` is the *companion's own URL* (returned as `slug`
  when you create it). This is what `_common.md`'s Step 0 measures 14
  days later, and it must always be a URL the action actually touched.
- `source_page_url` is the *existing* page that made you consider this
  candidate (the underperforming page for rules 1-2, the already-ranking
  Klaussa page for rule 3), used only so tomorrow's exclusion set (above)
  recognizes that page already has a companion. Null for rule 4, which
  has no existing page at all.
Also note the page that inspired the candidate in `cluster_topic` for
human-readable context (e.g. "Companion for /blog/bedanya-mou-dan-pks:
MoU vs PKS FAQ") — that field is free text for a person reading the
digest email, `source_page_url` is the structured value the exclusion
set actually queries.
`action_type`: use `new-page` for a rule-4 candidate (no existing page
at all) or `companion-post` for rules 1-3 (a new post placed alongside
an existing page). GEO's own publishing (which reuses this section)
uses `citation-gap-fix`.

`baseline_metrics` describes the *companion's* day-0 state, not the
source page's existing performance — the companion has no GSC history
yet, so this is almost always `{"position": null, "ctr": null,
"impressions": null, "clicks": null, "measured_at": "<today>"}`. Record
the source page's current numbers (the ones that made it a candidate)
in `cluster_topic` or the digest summary instead — useful context for a
human, but not what Step 0 diffs against 14 days later.

Follow `writing_preferences` from context — it is binding, not advisory.

Sign in as the writer bot once (it cannot publish, by design):
```bash
TOKEN=$(curl -s -X POST "$BACKEND_URL/api/v1/auth/sign-in" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$WRITER_EMAIL\",\"password\":\"$WRITER_PASSWORD\"}" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['session']['access_token'])")
```

For **each** of the up to 5 chosen candidates, in order, keep a running
list of the `actions.sqlite` row ids you insert (you'll need the exact
list at the end — do not re-derive it from `run_date`, which is
ambiguous if this job is ever run twice in one day):

1. Create the draft. `content` is a Tiptap JSON doc, not markdown:
   `heading` nodes (`"attrs":{"level":2}`) for section titles, `paragraph`
   nodes for body. Always `"status":"need_approval"` — never `draft`
   (invisible to the reviewer) or `published` (you cannot set it anyway).
   ```bash
   BLOG=$(curl -s -X POST "$BACKEND_URL/api/v1/blogs" \
     -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
     -d '{"title":"...","content":{...},"status":"need_approval","tags":["seo"]}')
   BLOG_ID=$(echo "$BLOG" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
   BLOG_URL=$(echo "$BLOG" | python3 -c "import json,sys; d=json.load(sys.stdin); print('https://klaussa.com/blog/' + d['slug'])")
   ```
2. Immediately record it — do not wait until all candidates are drafted.
   Use `sqlite3`'s Python module with bound parameters, not shell string
   interpolation — an apostrophe or quote in an LLM-authored topic string
   (very plausible in Indonesian legal text) would otherwise break the
   SQL literal or the shell string silently:
   ```bash
   ROW_ID=$(python3 -c "
   import sqlite3, json
   conn = sqlite3.connect('seo-geo-cron/data/actions.sqlite')
   cur = conn.execute(
       '''INSERT INTO actions
          (job, run_date, cluster_topic, cluster_keywords, source_page_url,
           target_page_url, action_type, blog_id, baseline_metrics, status,
           created_at)
          VALUES (?, date('now'), ?, ?, ?, ?, ?, ?, ?, 'drafted', datetime('now'))''',
       (
           'seo',
           '<topic, e.g. \"Companion for /blog/xyz: MoU vs PKS FAQ\">',
           json.dumps(['<keyword or query 1>', '<keyword or query 2>']),
           '<the existing page that inspired this candidate, or None for rule 4>',
           '<BLOG_URL value, the companion\'s own URL>',
           '<new-page|companion-post>',
           '$BLOG_ID',
           json.dumps({'position': None, 'ctr': None, 'impressions': None,
                       'clicks': None, 'measured_at': '2026-08-27'}),
       ),
   )
   conn.commit()
   print(cur.lastrowid)
   ")
   ```
   Writing this immediately after each draft — not batched at the end —
   means an interrupted run never leaves a drafted-but-unrecorded item
   that tomorrow's exclusion set would miss. Append `$ROW_ID` to your
   running list of inserted ids.

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

**If this call fails** (non-2xx, or no response): this outranks every
other escalation condition in this run — if another escalation
condition (e.g. "rank tracker not configured") also fired earlier in
this same run, fold it into this one issue instead of using the
one-per-run slot on the less urgent finding. Escalate once, titled
"[SEO/GEO] digest send failed — N drafts orphaned", listing every
`blog_id` drafted this run. Do not leave them unrecorded and unreachable
— they are already in `need_approval` with no email pointing at them.

**On success**, flip exactly the rows you just inserted from `drafted` to
`proposed`, by id — not by date, which a same-day retry would get wrong:
```bash
python3 -c "
import sqlite3
conn = sqlite3.connect('seo-geo-cron/data/actions.sqlite')
ids = [<ROW_ID_1>, <ROW_ID_2>]  # every id collected above
conn.executemany('UPDATE actions SET status=\'proposed\' WHERE id=?',
                  [(i,) for i in ids])
conn.commit()
"
```

Then stop. A human decides from the email. Do not poll for their
decision.

## After acting

For each candidate acted on, add a short `appendResearchLog` entry naming
the page/topic and the keyword cluster, so tomorrow's run can see what
was already attempted without needing to open the SQLite file.
