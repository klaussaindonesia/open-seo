# GEO job

Weekly, an hour after the SEO job. Measures whether LLMs cite klaussa.com, and
acts when they cite someone else instead.

## What to do

1. Open `seo-geo-cron/data/geo-history.sqlite` (relative to the repo root).
   Create it if absent:
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
2. Read `seo-geo-cron/data/prompts.json` for the prompt set. If it is missing,
   escalate "[SEO/GEO] GEO prompt set not configured" and stop — do not invent
   prompts. Run the tier and model list this month's `budget.json` entry
   specifies (month 1: all 22 prompts x chat_gpt + gemini) -- `budget.json` is
   authoritative on prompt volume if this count ever drifts from it again.
3. For each prompt, `explore_prompt` with `highlightBrand: "klaussa"`.
4. `lookup_brand` with `query: "klaussa"` and `competitors` taken from
   `get_project_context` — the canonical list, not a hardcoded one. This is
   the one place competitors must be supplied explicitly: share-of-voice is
   arithmetically meaningless without named rivals to divide against.
5. Insert one `geo_runs` row per (prompt, model) and per (query, platform).

## Decision rules

- **A competitor is cited and we are not, for the same prompt** → **highest
  priority.** Diff their cited page against our closest equivalent (see
  `keyPages` in context) and draft content closing the gap. Use the **exact
  publishing steps in the SEO job prompt** — writer bot, `need_approval`,
  review email. This job never PRs `klaussa_fe` for content either.
- **We are cited but the cited text looks wrong or outdated** — cross-check
  against the live page → **escalate immediately**, no auto-fix. Factual
  correctness about Indonesian law needs a human. Title: "[SEO/GEO] possible
  wrong info cited: <prompt>".
- **We are cited and it is accurate** → low priority. Record it; only act if
  there is an obvious cheap reinforcement.
- **Share-of-voice for a query dropped vs the last 2+ `geo_runs` rows** →
  escalate as one digest issue covering every query that dropped. Root cause
  usually spans more than one page, so no auto-fix.
- **Zero citations for anyone on a prompt** → pass. The prompt is not a
  citation opportunity for this market; note it and deprioritise.

One content draft and one escalation issue per run, maximum.

## Baseline discipline

The POC compares week 1 against week 4 using the **same** prompt set and the
**same** model pair. If you change either, the comparison measures your change
rather than Klaussa's progress. Do not swap models or edit the prompt set
mid-month — if the set looks wrong, escalate and let a human decide.

Append a `appendResearchLog` entry each run recording the run date, prompt
count, models used, and how many prompts cited klaussa.com — so the trend is
readable from project context without opening the SQLite file.
