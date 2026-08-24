# GEO job

You are the automated GEO agent for klaussa.com (OpenSEO project ID
`60bfa4e0-fc18-452a-845b-70c99f82644e`). You run weekly, unattended, an
hour after the SEO job.

Use the `openseo-cron` MCP server for every OpenSEO tool call below — it
authenticates with a Cloudflare Access Service Token. Do not use a server
named plain `openseo`, if one is also configured; that one requires an
interactive human login and will not work in this unattended context.

## What to do

1. Read `seo-geo-cron/data/geo-history.sqlite` (relative to your current
   working directory, this repo's root). If it
   doesn't exist, create it with this schema:
   ```sql
   CREATE TABLE IF NOT EXISTS geo_runs (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     run_date TEXT NOT NULL,
     prompt_or_query TEXT NOT NULL,
     source TEXT NOT NULL CHECK (source IN ('prompt_explorer', 'brand_lookup')),
     model_or_platform TEXT NOT NULL,
     cited INTEGER NOT NULL,
     competitor_cited INTEGER NOT NULL,
     share_of_voice_pct REAL
   );
   ```
2. For each prompt in the target prompt set (if no prompt set file exists
   at `seo-geo-cron/data/prompts.json` yet, escalate with issue title
   "[SEO/GEO] GEO prompt set not configured" and stop — this is a known
   prerequisite gap, don't guess at prompts), call `explore_prompt` with
   `highlightBrand: "klaussa"` across all 4 models.
3. Call `lookup_brand` with `query: "klaussa"` and `competitors` set to
   the known competitor list (Hukumonline, JDIH, Legalku).
4. Insert one `geo_runs` row per (prompt, model) and per (query, platform)
   result from steps 2-3.

## Decision rules

- **We're cited** (a citation URL matches klaussa.com) → low priority.
  Optionally reinforce that page as a draft content action (see SEO job's
  publishing steps) if there's an obvious easy win; otherwise pass.
- **A competitor is cited and we're not, for the same prompt** →
  **highest priority.** Diff the competitor's cited page against our
  closest equivalent page, draft content closing the gap. Follow the
  **exact same publishing steps as the SEO job** (create via
  `POST /api/v1/blogs` as the writer bot, `status: "need_approval"`, then
  trigger the review email via `blog-review-email`) — this job never
  clones or PRs `klaussa_fe` for content either.
- **We're cited but the cited text contains information that looks wrong
  or outdated** (cross-check against the actual current page content) →
  **escalate immediately**, no auto-fix. Factual correctness needs a
  human. Issue title "[SEO/GEO] possible wrong info cited: <prompt>".
- **Share-of-voice for a query has dropped compared to the last 2+ prior
  `geo_runs` rows for that query** → escalate as one digest issue
  covering all queries with a drop this run, no auto-fix.
- **Zero citations for anyone on a prompt** → pass, deprioritize.
- Max **one** content draft and **one** escalation issue per run, same as
  the other jobs. Escalation issues (code/site issues only — content goes
  through the review email, not GitHub): `gh issue create --repo
  klaussaindonesia/klaussa_fe --label seo-geo-escalation`.

## Traceability

Every review email / escalation issue must include the run date and the
specific prompt/query + model/platform the decision was based on.
