# GEO job

Weekly, an hour after the SEO job. Measures whether LLMs cite
klaussa.com, and acts on up to 2 citation gaps per run, delivered as one
digest email.

## What to do

0. **Outcome tracking first.** Follow `_common.md`'s "Outcome tracking"
   section — check and judge any of your own (`job='geo'`) past actions
   that are due, before anything else below.
1. Open `seo-geo-cron/data/geo-history.sqlite` (relative to the repo
   root). Create it if absent:
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
2. **Due-gate.** `SELECT MAX(run_date) FROM geo_runs` (a missing/empty
   table means no baseline yet — today is due). Read this month's cadence
   from `budget.json`'s `geo_prompts.schedule` (authoritative — "weekly"
   most months, "every other week" in month 4). If not enough days have
   elapsed since that date, **stop — do not call any paid tool**
   (`explore_prompt`/`lookup_brand`). This is the common case and should
   cost nothing. `explore_prompt` also caches for 7 days, so running early
   risks writing rows that look like fresh measurement but are really
   replayed cache — silently corrupting the week-1-vs-week-4 comparison
   and the "share-of-voice dropped" rule below, which both depend on
   `geo_runs` reflecting real, independent weekly samples.
3. Read `seo-geo-cron/data/prompts.json` for the prompt set. If it is
   missing, escalate "[SEO/GEO] GEO prompt set not configured" and stop —
   do not invent prompts. Run the tier and model list this month's
   `budget.json` entry specifies (month 1: all 22 prompts x chat_gpt +
   gemini) — `budget.json` is authoritative on prompt volume if this
   count ever drifts from it again.
4. For each prompt, `explore_prompt` with `highlightBrand: "klaussa"`.
5. `lookup_brand` with `query: "klaussa"` and `competitors` taken from
   `get_project_context` — the canonical list, not a hardcoded one. This
   is the one place competitors must be supplied explicitly: share-of-
   voice is arithmetically meaningless without named rivals to divide
   against.
6. Insert one `geo_runs` row per (prompt, model) and per (query,
   platform).

## Finding this week's opportunities

1. From this run's `explore_prompt` results, list every prompt where a
   competitor is cited and klaussa.com is not.
2. Query `actions.sqlite` for prompts already covered by any past `geo`
   row (`SELECT cluster_keywords FROM actions WHERE job='geo'` — for
   GEO, `cluster_keywords` holds the prompt text(s) a past action
   addressed, not tracked keywords). Drop already-covered prompts.
3. If two or more remaining gap prompts clearly target the same
   underlying page/topic — the same bar as SEO's clustering: one page
   could fully answer both — treat them as one opportunity.
4. Rank remaining opportunities: a clear diff-and-close case (a specific
   competitor page maps directly onto something klaussa.com could
   plausibly own) ranks above a vague thematic gap.
5. Take the top 2. Fewer than 2 → do fewer, no padding.

## Decision rules

- **A competitor is cited and we are not, for the same prompt** — the
  case handled by "Finding this week's opportunities" above. Diff their
  cited page against our closest equivalent (see `keyPages` in context)
  and draft content closing the gap.
- **We are cited but the cited text looks wrong or outdated** —
  cross-check against the live page → **escalate immediately**, no
  auto-fix. This is separate from the 2-opportunity cap above — it can
  escalate in addition to, not instead of, the 2 content actions.
  Factual correctness about Indonesian law needs a human. Title:
  "[SEO/GEO] possible wrong info cited: <prompt>".
- **We are cited and it is accurate** → low priority, not an
  opportunity. Record it; only act if there's an obvious cheap
  reinforcement and cap remains.
- **Share-of-voice for a query dropped vs the last 2+ `geo_runs` rows** →
  escalate as one digest issue covering every query that dropped (still
  subject to the one-escalation-per-run cap in `_common.md` — if both
  this and the wrong-citation case above fire the same run, combine them
  into one escalation issue rather than two).
- **Zero citations for anyone on a prompt** → pass. The prompt is not a
  citation opportunity for this market; note it and deprioritise.

## Publishing: draft all chosen opportunities, then send one digest

Use the **exact publishing mechanics in `seo.md`'s "Publishing" section**
(writer bot sign-in, `need_approval` Tiptap draft, immediate
`actions.sqlite` row per draft with `job='geo'`, then one combined
digest intake call for everything drafted this run, flip
`drafted`→`proposed` on success, escalate naming orphaned `blog_id`s on
failure). This job never PRs `klaussa_fe` for content either.

Then stop. A human decides from the email. Do not poll for their
decision.

## Baseline discipline

The POC compares week 1 against week 4 using the **same** prompt set and
the **same** model pair. If you change either, the comparison measures
your change rather than Klaussa's progress. Do not swap models or edit
the prompt set mid-month — if the set looks wrong, escalate and let a
human decide.

Append an `appendResearchLog` entry each run recording the run date,
prompt count, models used, and how many prompts cited klaussa.com — so
the trend is readable from project context without opening the SQLite
file.
