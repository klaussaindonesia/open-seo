# Papercuts

Small, non-blocking friction in the repository itself — the kind that will
waste the next contributor's time too. Log it in the moment; review and fix
entries in a separate, user-requested cleanup pass.

This is not a completed-work log, a bug tracker, or a place for the agent's own
sandbox/shell/network hiccups. Never include secrets, credentials, personal
data, or sensitive paths.

## Open

- [ ] `2026-08-27T05:12:00Z` — `claude` — `seo-geo-cron/run.sh` does `cd "$SCRIPT_DIR/.."` before invoking claude but `pilot-run.sh` does not, so the repo-root-relative paths the prompts use (`seo-geo-cron/data/actions.sqlite`, `seo-geo-cron/data/budget.json`) resolve to different places depending on which runner launched the job — a piloted run can silently create a second actions.sqlite. Add the same `cd` to `pilot-run.sh`.
- [ ] `2026-08-27T05:12:00Z` — `claude` — `api.klaussa.com` rejects Python `urllib`'s default user-agent with a bare 403 while accepting `curl` with an identical body and headers, so a Python helper against the blog API fails looking like an auth problem when the token is fine. `seo-geo-cron/prompts/seo.md` documents only the curl form; worth stating outright that the edge filters by user-agent and non-curl clients must set one.
- [ ] `2026-08-18T03:06:44Z` — `claude` — Changing an MCP tool's `outputSchema` while the dev server hot-reloads makes in-flight MCP sessions reject the tool's own (already billed) results — clients validate against the schema cached at connect time, surfacing as "must NOT have additional properties". Note in the MCP dev docs/skill: reconnect the MCP session after any output-schema change before re-testing live.
- [ ] `2026-08-05T20:59:09Z` — `codex` — The documented `pnpm seed:rank-tracking` command fails before opening local D1 because `scripts/seed-rank-tracking.ts` imports the provider-aware `src/db/schema` barrel and plain `tsx` cannot load the resulting `cloudflare:workers` URL. Keep the seed script on dialect-local schema imports or run it through a Workers-compatible execution path. (Workaround: seed via raw SQL with `wrangler d1 execute DB --local`.)
- [ ] `2026-08-01T16:28:36Z` — `claude` — web's pinned wrangler 4.71.0 fails `kv namespace create` with a bare "Authentication error [code: 10000]" even though the OAuth token has workers_kv write scope; wrangler@4.118.0 succeeds with identical auth. Fix: bump wrangler in web/package.json.
- [ ] `2026-07-20T20:08:28Z` — `claude` — In a fresh git worktree, `oxlint --type-aware` crashes with `Cannot find module '@oxlint/binding-darwin-arm64'` — the platform-specific optional dep is missing from the worktree's node_modules while tsc/prettier work fine, and plain `pnpm install` reports up-to-date without restoring it; `pnpm install --force` (~22s) fixes it. Worth making the worktree-setup hook (or a documented step) run the forced install so lint doesn't die on fresh worktrees.
- [ ] `2026-07-19T04:06:52Z` — `codex` — `pnpm --dir web build` fails with `vite: command not found` when `web/node_modules` is absent, despite the root toolchain being installed. Document or enforce the package-local install required before validating the `web/` subpackage.
- [ ] `2026-07-19T02:55:56Z` — `claude` — Adding a docs folder under `web/content/docs` whose `meta.json` lists an `[Overview](...)` link renders a duplicated, double-highlighted sidebar entry, because the folder-index strip in `web/src/lib/source.ts` (`transformPageTree.folder`) is a per-folder-name allowlist. Derive it from the meta convention (or strip the index for all folders) so new sections don't need a hidden source.ts edit.
- [ ] `2026-07-14T01:28:30Z` — `claude` — Regenerating the lockfile (adding or moving a dep) makes `pnpm install` re-run the `minimumReleaseAge` gate on transitive peers already pinned at that exact version (`mysql2`, `sql-escaper`, `@aws-sdk/credential-providers`), failing the install even though nothing about them changed. `pnpm install --config.minimumReleaseAge=0` — then confirm the lockfile diff stays version-neutral — unblocks it; worth documenting that regen step so the gate doesn't re-block already-pinned versions.
- [ ] `2026-07-10T21:28:46Z` — `codex` — `pnpm --dir badseo run typecheck` works through the root toolchain but `pnpm --dir badseo run build` can't find Vite because `badseo/node_modules` is absent. Document or enforce the package-local install before validating the `badseo/` subpackage.
- [ ] `2026-07-10T21:32:10Z` — `codex` — Formatting the `badseo/` workspace with `pnpm exec prettier` fails because Prettier is only available from the repository root. Document the root-only formatter command or expose a workspace-local formatting script.

## Resolved

Move fixed entries here, mark them checked, and append the resolving date or commit.

- [x] `2026-08-25T13:38:51Z` — `claude` — `update_project_context`'s `appendResearchLog.summary` silently caps at 1000 characters, but `seo-geo-cron/prompts/_common.md` just says to append "a one-line entry". Fixed 2026-08-25: `_common.md` now states the 1000-char cap next to the instruction.
- [x] `2026-08-25T12:35:00Z` — `claude` — `seo-geo-cron/prompts/geo.md` told the GEO job to run "all 20 prompts" in month 1 while `data/prompts.json`/`data/budget.json` both say 22. Fixed 2026-08-25: `geo.md` now cites 22 and defers to `budget.json` if the count ever drifts again.

## badseo harness vs `wrangler dev`: sitemap emits badseo.dev locs locally

`badseo/scripts/run-audit.ts` against a local `wrangler dev --port 8787` fails 4
sitemap-dependent checks (orphan page, 500, 403, duplicate-content) with
NOT CRAWLED: wrangler dev adopts the `badseo.dev` custom-domain route as the
host the worker sees, so `/sitemap.xml` emits `http://badseo.dev/...` locs that
the crawler's same-origin filter drops. Run it as
`wrangler dev --port 8787 --local-upstream "localhost:8787"` (after
`vite build`). Also: `pnpm --filter badseo audit` fails with
"Unknown option: 'recursive'" from the repo root — badseo is its own pnpm
workspace, not a root workspace member; use `npx tsx badseo/scripts/run-audit.ts`.
