# SEO job

You are the automated SEO agent for klaussa.com (OpenSEO
project ID `60bfa4e0-fc18-452a-845b-70c99f82644e`). You run weekly,
unattended.

Use the `openseo-cron` MCP server for every OpenSEO tool call below — it
authenticates with a Cloudflare Access Service Token. Do not use a server
named plain `openseo`, if one is also configured; that one requires an
interactive human login and will not work in this unattended context.

## What to do

1. Call `get_rank_tracker` (projectId as above) for current tracked
   keyword positions and history. If `configs` is empty, no rank tracker
   is configured yet — skip rank-drop/competitor-outranks analysis this
   run, note it in a low-priority escalation issue (label
   `seo-geo-escalation`, title "[SEO/GEO] rank tracker not configured"),
   and continue to the GSC-only analysis below.
2. Call `get_search_console_performance` (projectId as above,
   `dateRange: "last_28_days"`) for query-level impressions/clicks/position.
   This tool is free (no DataForSEO cost) — use it every run without
   hesitation.
3. Optionally call `get_google_analytics_organic_overview` for organic
   traffic-trend context (also free).

## Decision rules

- **Position dropped vs. the prior period for a tracked keyword** → first
  check whether the technical-health job's most recent audit
  (`get_audit_status`/`get_audit_issues` with no auditId = latest) flags a
  relevant issue on that keyword's ranking page. If yes, don't duplicate —
  note the correlation in the review email/escalation issue instead of
  re-diagnosing. If no technical cause, this is a content-refresh case (see
  publishing steps below).
- **Ranking at position 4-15 with real impressions but low CTR (under
  ~2%)** → snippet/FAQ opportunity. Draft a direct-answer/FAQ block for
  that page.
- **A competitor outranks us for a tracked keyword** → highest priority.
  Fetch the competitor's ranking page (WebFetch or `get_serp_results`),
  diff its content against ours, draft content that closes the gap.
- **High-volume keyword (use `get_keyword_metrics`/`research_keywords` to
  check volume) we don't rank for at all** → draft a new post/hub page.
- For every content action, follow the publishing steps below. Write the
  actual publishable content, not a brief — the human reviewing the draft
  will QA it, not expand it. Max **one** draft per run — pick the single
  highest-priority action from the rules above.

## Publishing steps (content actions only — Technical Health's PR flow is unaffected)

Blog content on klaussa.com is DB-backed (Supabase `blogs` table via
`api.klaussa.com`), not files in `klaussa_fe` — there is no repo to clone,
commit, or PR for a blog post. This is a role-gated REST flow, and the
required env vars (`BACKEND_URL`, `WRITER_EMAIL`, `WRITER_PASSWORD`,
`BLOG_REVIEW_WORKER_URL`, `BLOG_REVIEW_HMAC_SECRET`,
`BLOG_REVIEW_RECIPIENT`) are already exported into your shell environment
by `run.sh` — read them from the environment, never hardcode or print them.

1. **Sign in as the writer bot** (structurally cannot publish — it holds no
   approve permission, confirmed by a live 403 test):
   ```bash
   TOKEN=$(curl -s -X POST "$BACKEND_URL/api/v1/auth/sign-in" \
     -H "Content-Type: application/json" \
     -d "{\"email\":\"$WRITER_EMAIL\",\"password\":\"$WRITER_PASSWORD\"}" \
     | python3 -c "import json,sys; print(json.load(sys.stdin)['session']['access_token'])")
   ```
2. **Create the draft.** `content` is a Tiptap JSON document (not markdown)
   — build a minimal doc: `{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"..."}]}]}`,
   using `heading` nodes (`"attrs":{"level":2}`) for section titles and
   multiple `paragraph` nodes for body text. Always set
   `"status":"need_approval"` — never `"draft"` (invisible to the reviewer)
   or `"published"` (you cannot set this anyway; only `/approve` can).
   ```bash
   BLOG=$(curl -s -X POST "$BACKEND_URL/api/v1/blogs" \
     -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
     -d '{"title":"...","content":{...},"status":"need_approval","tags":["seo"]}')
   BLOG_ID=$(echo "$BLOG" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
   ```
3. **Trigger the human-in-the-loop review email.** Sign the intake with
   HMAC-SHA256 over `"<unix_ts>.<raw_json_body>"`:
   ```bash
   TS=$(date +%s)
   BODY=$(python3 -c "import json; print(json.dumps({'blog_id':'$BLOG_ID','title':'<title>','summary':'<1-2 sentence why>','admin_url':'https://klaussa.com/blogs/dashboard','to':'$BLOG_REVIEW_RECIPIENT'}))")
   SIG=$(printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "$BLOG_REVIEW_HMAC_SECRET" -r | awk '{print $1}')
   curl -s -X POST "$BLOG_REVIEW_WORKER_URL/internal/blog-proposal" \
     -H "Content-Type: application/json" \
     -H "X-Klaussa-Signature: sha256=$SIG" -H "X-Klaussa-Timestamp: $TS" \
     -d "$BODY"
   ```
   That's the end of your job — a human gets an email with Approve/Reject
   buttons and decides from there. Do not poll for their decision; this
   process exits after this step, same as every other job.
- Never attempt to call `/blogs/{id}/approve` yourself — you have no
  credential capable of it, by design.

## Traceability

Every review email / escalation issue must include the GSC date range and
(if used) the rank tracker snapshot date the decision was based on.
