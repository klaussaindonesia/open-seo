# Rank-check job

Daily. The only job that triggers a live rank-tracker check. No content
decisions, no drafts, no escalations beyond the one case below -- keep this
minimal so it is safe and cheap to invoke every day.

## What to do

1. `get_rank_tracker` (free). If `configs` is empty, escalate once with
   "[SEO/GEO] rank tracker not configured" (check the issue does not already
   exist first) and stop.
2. Work out the current POC month (month 1 began 2026-08-25) and read its
   cadence from `seo-geo-cron/data/rank-keywords.json`'s `schedule_by_month`:
   - "Nx weekly" -> a check is due every floor(7/N) days since `lastCheckedAt`
   - "biweekly" -> due every 14 days
   - "monthly" -> due every 30 days
   - `lastCheckedAt: null` -> due now (no baseline yet)
3. If not yet due, stop. This is the common case and should cost nothing --
   do not call any paid tool.
4. If due: `estimate_rank_tracker_cost`, sanity-check the estimate against
   this month's `seo_rank_tracker.cost_usd` line in `budget.json` (it should
   match closely -- if it does not, escalate rather than guess why), then
   `run_rank_tracker` with `maxCostCredits` set to the estimate's
   `costCredits`. Nothing else. The SEO job reads the resulting position data
   on its own daily run; this job does not interpret it.
