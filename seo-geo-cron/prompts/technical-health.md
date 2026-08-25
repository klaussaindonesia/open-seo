# Technical Health job

Daily. Finds technical SEO regressions and either fixes them or escalates.

## What to do

1. `run_site_audit` with `url: "https://klaussa.com"`, default `maxPages` (50),
   and `runLighthouse` per this month's budget entry. The crawl itself is free
   (OpenSEO crawls via its own Workers fetch); only Lighthouse costs money, at
   $0.005/page.
2. Poll `get_audit_status` until `status` is `"completed"` or `"failed"`.
   **Do this synchronously, in a loop, in this same turn** — `sleep 15` between
   polls via Bash and call the tool again yourself. Nothing will resume you
   later. If it is still running after ~10 minutes (40 polls), escalate with
   "[SEO/GEO] technical-health audit did not complete in time" and stop.
3. `get_audit_issues` for the full report (free).

## Decision rules

- **Broken internal links, broken pages (4xx), meta-description-too-long,
  title-too-long, missing-h1, or templated schema gaps** where one fix clearly
  resolves many occurrences (e.g. a dead nav/footer target hit from every
  page) → **auto-fix, open a PR.**
  - Work in `seo-geo-cron/klaussa_fe-workspace/` (relative to the repo root,
    already cloned). `git checkout main && git pull`, then branch
    `self-heal-technical-health-<YYYYMMDD>`.
  - Touch only the files needed for that fix. Never touch `auth/`, `billing/`,
    `.github/workflows/`, or any `*migration*`/`*schema*` path — if the fix
    seems to need one of those, escalate instead.
  - Commit, push, `gh pr create --repo klaussaindonesia/klaussa_fe --base main
    --head self-heal-technical-health-<YYYYMMDD>`. The body must state the
    audit ID and list every issue fixed with its issueType.
  - If more distinct fixes exist than fit one coherent PR, fix the
    highest-severity/highest-count cluster and leave the rest for tomorrow.
- **Server errors (5xx), failed Lighthouse checks, slow-response pages, or any
  issue whose fix is unclear or touches a guardrailed path** → **escalate.**
  Bundle related findings into one issue.
- **Info-level cosmetic issues with no clear fix** → pass.

## Known issues — check context before escalating

`current_goal` in project context records what is already known and tracked.
As of month 1 that includes the intermittent 503s on `/peraturan/*`
(klaussa_fe#1276) and the fact that `/peraturan/jenis/*` and
`/peraturan/tahun/*` draw zero search impressions.

**Do not open a duplicate issue for something already tracked there.** If this
run's audit shows a *material change* — the 503s spreading to new route
groups, clearing up entirely, or a fresh regression elsewhere — comment on the
existing issue instead, or open a new one only if it is genuinely a different
fault.

## Prioritisation

Weight issues on pages listed in `keyPages` above issues on pages that are
not. A broken title on a `money` or `hub` page matters more than the same
issue on a page with no traffic.
