# SEO job

Weekly. Turns ranking and search-console data into one content action.

## What to do

1. `get_rank_tracker` for tracked positions and history. If `configs` is empty
   no tracker exists yet — escalate once with "[SEO/GEO] rank tracker not
   configured" (check the issue does not already exist first), then continue
   with the GSC-only analysis below.
2. `get_search_console_performance` (`dateRange: "last_28_days"`, dimensions
   `["query"]` and `["page"]`). Free — use it every run.
3. Optionally `get_google_analytics_organic_overview` for traffic trend (free).

## Decision rules, in priority order

Read `current_goal` from context first — it names the specific thing this POC
is trying to move, and that outranks generic best practice.

1. **A key page ranks well but converts badly.** This is the highest-value
   action for klaussa.com: the blog draws ~1.6x the impressions of the
   regulation pages and converts them at about a fifth of the rate. A page at
   position 4-15 with real impressions and CTR under ~2% needs a direct-answer
   or FAQ block, not a new article. `keyPages` in context records measured CTR
   per page — start there, and compare against the best-converting page in
   that list to see what "good" looks like on this site.
2. **Position dropped vs. the prior period.** Check the technical-health job's
   latest audit (`get_audit_issues`, no auditId = latest, free) for a technical
   cause on that page before assuming it is a content problem. If there is one,
   note the correlation rather than re-diagnosing it.
3. **A competitor outranks us for a tracked keyword.** Competitors come from
   `get_project_context`, not a hardcoded list — and the SERP itself will show
   others you were not told about. Fetch their ranking page, diff against ours,
   close the gap.
4. **A high-volume keyword we do not rank for at all** → draft a new page.
   Lowest priority: strengthening a page that already ranks beats starting from
   zero.

Pick the single highest-priority action. One content draft per run.

## Publishing

Blog content is DB-backed (Supabase via `api.klaussa.com`), not files in
`klaussa_fe` — there is no repo to PR for a blog post. Required env vars are
already exported by `run.sh`; read them from the environment, never print them.

Follow `writing_preferences` from context — it is binding, not advisory.

1. Sign in as the writer bot (it cannot publish, by design):
   ```bash
   TOKEN=$(curl -s -X POST "$BACKEND_URL/api/v1/auth/sign-in" \
     -H "Content-Type: application/json" \
     -d "{\"email\":\"$WRITER_EMAIL\",\"password\":\"$WRITER_PASSWORD\"}" \
     | python3 -c "import json,sys; print(json.load(sys.stdin)['session']['access_token'])")
   ```
2. Create the draft. `content` is a Tiptap JSON doc, not markdown: `heading`
   nodes (`"attrs":{"level":2}`) for section titles, `paragraph` nodes for body.
   Always `"status":"need_approval"` — never `draft` (invisible to the
   reviewer) or `published` (you cannot set it anyway).
   ```bash
   BLOG=$(curl -s -X POST "$BACKEND_URL/api/v1/blogs" \
     -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
     -d '{"title":"...","content":{...},"status":"need_approval","tags":["seo"]}')
   BLOG_ID=$(echo "$BLOG" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
   ```
3. Trigger the review email. Sign the intake with HMAC-SHA256 over
   `"<unix_ts>.<raw_json_body>"`:
   ```bash
   TS=$(date +%s)
   BODY=$(python3 -c "import json; print(json.dumps({'blog_id':'$BLOG_ID','title':'<title>','summary':'<1-2 sentences: which query cluster, its impressions/CTR/position, and why this page>','admin_url':'https://klaussa.com/blogs/dashboard','to':'$BLOG_REVIEW_RECIPIENT'}))")
   SIG=$(printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "$BLOG_REVIEW_HMAC_SECRET" -r | awk '{print $1}')
   curl -s -X POST "$BLOG_REVIEW_WORKER_URL/internal/blog-proposal" \
     -H "Content-Type: application/json" \
     -H "X-Klaussa-Signature: sha256=$SIG" -H "X-Klaussa-Timestamp: $TS" \
     -d "$BODY"
   ```
   The worker renders the full draft into the email, so the summary is context
   for the decision, not a substitute for the content.

Then stop. A human decides from the email. Do not poll for their decision.

## After acting

If the draft targets a page in `keyPages`, add a short `appendResearchLog`
entry naming the page and the query cluster, so next week's run can see what
was already attempted and measure whether it worked rather than repeating it.
