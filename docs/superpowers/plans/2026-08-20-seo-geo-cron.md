# SEO/GEO Cron Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose OpenSEO's Prompt Explorer and Brand Lookup as MCP tools, deploy them to the self-hosted instance, and stand up the three-job agentic cron system (technical health, ranking & content, GEO/AI-citation) on the desktop host so it can run unattended against klaussa.com.

**Architecture:** Two new MCP tools (`explore_prompt`, `lookup_brand`) added to the existing OpenSEO MCP server, following the exact wiring pattern already used by every other tool (`withMcpProjectAuth` → service call → `mcpResponse`). Three cron jobs are plain `claude -p "<prompt file>"` invocations on a remote desktop host, scheduled via crontab, each with MCP + git/`gh` tool access — no bespoke orchestration code.

**Tech Stack:** TypeScript, Zod, Vitest, `@modelcontextprotocol/server`, Cloudflare Workers (Alchemy deploy), Claude Code CLI (headless `-p` mode), bash/crontab, `gh` CLI.

**Spec:** `docs/superpowers/specs/2026-08-20-seo-geo-cron-design.md`

## Global Constraints

- Self-hosted OpenSEO instance: `https://open-seo-selfhost.navigoinfo-id.workers.dev`, deployed via `pnpm run deploy:selfhost` (requires Alchemy OAuth with `access:write` scope already configured on this machine's `pnpm alchemy login`).
- Every new MCP tool must follow the existing pattern in `src/server/mcp/tools/site-audit-tools.ts` exactly: `withMcpProjectAuth` handler, `mcpResponse` for output, `looseObjectOutputSchema` for complex passthrough results, `projectIdSchema` for the `projectId` field.
- Both `explorePrompt()` and `getBrandLookup()` are billing-gate-free in self-hosted mode already (`assertPaidPlan` only checks `isHostedServerAuthMode()`) — no plan-gating code needed.
- Desktop host: `ez@100.120.136.18` (SSH alias `fiskal-vps`, key `~/.ssh/id_fiskal_vps`). Crontab is the scheduling mechanism (matches the existing `claude -p "System warmup."` entry already there) — no systemd timers, no Docker.
- Guardrails from spec §8 (branch naming `self-heal-<job>-<YYYYMMDD>` / `content-<job>-<slug>-<YYYYMMDD>`, max 1 PR + 1 issue per job per run, no force-push, no self-merge, content PRs opened as drafts, escalation issues labeled `seo-geo-escalation`) must be written verbatim into each job's prompt file.
- Rank tracker / GEO keyword seeding and multi-week monitoring are explicitly **out of scope** for this plan (spec §6, §9 step 6) — flagged as follow-up in the final task, not blocked on.

---

### Task 1: `explore_prompt` MCP tool

**Files:**
- Create: `src/server/mcp/tools/explore-prompt.ts`
- Create: `src/server/mcp/tools/explore-prompt.test.ts`

**Interfaces:**
- Consumes: `explorePrompt(input: PromptExplorerInput, billingCustomer: BillingCustomerContext): Promise<PromptExplorerResult>` from `@/server/features/ai-search/services/promptExplorer`; `promptExplorerModelSchema` (enum of `"chat_gpt"|"claude"|"gemini"|"perplexity"`), `PROMPT_EXPLORER_MAX_PROMPT_LENGTH` (500), `webSearchCountryCodeSchema` from `@/types/schemas/ai-search`; `projectIdSchema` from `@/server/mcp/schemas`; `withMcpProjectAuth` from `@/server/mcp/project-auth`; `mcpResponse` from `@/server/mcp/formatters`; `buildProjectMeta` from `@/server/mcp/context`; `looseObjectOutputSchema`, `optionalMetaOutputSchema` from `@/server/mcp/output-schemas`; `makeToolContext` from `@/server/mcp/tools/tool-test-support`.
- Produces: `explorePromptTool` (named export), an `OpenSeoToolDefinition` with `name: "explore_prompt"` — consumed by Task 3's `server.ts` registration.

- [ ] **Step 1: Write the failing test**

```typescript
// src/server/mcp/tools/explore-prompt.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { explorePromptTool } from "./explore-prompt";
import { makeToolContext } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  explorePrompt: vi.fn(),
}));

vi.mock("@/server/features/ai-search/services/promptExplorer", () => ({
  explorePrompt: mocks.explorePrompt,
}));

vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: vi.fn().mockResolvedValue({ id: "project_1" }),
  },
}));

const toolContext = makeToolContext();

describe("explore_prompt MCP tool", () => {
  beforeEach(() => {});

  it("forwards validated input and billing context to explorePrompt", async () => {
    mocks.explorePrompt.mockResolvedValue({
      prompt: "best legal AI Indonesia",
      highlightBrand: "klaussa",
      fetchedAt: "2026-08-20T00:00:00.000Z",
      results: [
        {
          status: "success",
          model: "claude",
          modelName: "claude-sonnet-4-5",
          text: "Klaussa is a leading option...",
          citations: [],
          fanOutQueries: [],
          brandMentioned: true,
          outputTokens: 120,
          webSearch: true,
        },
      ],
    });

    const result = await explorePromptTool.handler(
      {
        projectId: "project_1",
        prompt: "best legal AI Indonesia",
        models: ["claude"],
        highlightBrand: "klaussa",
        webSearch: true,
      },
      // withMcpProjectAuth expects a ToolContext; requireProjectAccess wraps
      // it, so pass makeToolContext() directly as the raw tool context.
      toolContext,
    );

    expect(mocks.explorePrompt).toHaveBeenCalledWith(
      {
        projectId: "project_1",
        prompt: "best legal AI Indonesia",
        models: ["claude"],
        highlightBrand: "klaussa",
        webSearch: true,
        webSearchCountryCode: undefined,
      },
      { userId: "user_123", userEmail: "alice@example.com", organizationId: "org_123", projectId: "project_1" },
    );
    expect(result.structuredContent?.result).toMatchObject({
      prompt: "best legal AI Indonesia",
      results: [expect.objectContaining({ model: "claude", brandMentioned: true })],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/mcp/tools/explore-prompt.test.ts`
Expected: FAIL — `Cannot find module './explore-prompt'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```typescript
// src/server/mcp/tools/explore-prompt.ts
import { z } from "zod";
import { explorePrompt } from "@/server/features/ai-search/services/promptExplorer";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import {
  PROMPT_EXPLORER_MAX_PROMPT_LENGTH,
  promptExplorerModelSchema,
  webSearchCountryCodeSchema,
} from "@/types/schemas/ai-search";

const inputSchema = {
  projectId: projectIdSchema,
  prompt: z
    .string()
    .trim()
    .min(1)
    .max(PROMPT_EXPLORER_MAX_PROMPT_LENGTH)
    .describe("The prompt to ask each LLM, exactly as a user would type it."),
  models: z
    .array(promptExplorerModelSchema)
    .min(1)
    .max(4)
    .describe("Which LLMs to ask: chat_gpt, claude, gemini, perplexity."),
  highlightBrand: z
    .string()
    .trim()
    .min(1)
    .max(250)
    .optional()
    .describe(
      "Brand/domain to check for citations and mentions in each model's answer.",
    ),
  webSearch: z
    .boolean()
    .optional()
    .describe("Allow the model to browse the web when answering (default true)."),
  webSearchCountryCode: webSearchCountryCodeSchema
    .optional()
    .describe("ISO-2 country code for the web-search component of the answer."),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const explorePromptTool = {
  name: "explore_prompt",
  config: {
    title: "Explore an AI-search prompt",
    description:
      "Ask one prompt across up to four LLMs (ChatGPT, Claude, Gemini, Perplexity) and see each answer's text, citations, and whether a given brand was mentioned/cited. Uses DataForSEO's paid LLM Responses API — each model in the request is a separate paid call. Responses are cached 7 days.",
    inputSchema,
    outputSchema: z
      .object({
        result: looseObjectOutputSchema,
        ...optionalMetaOutputSchema,
      })
      .passthrough(),
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const result = await explorePrompt(
      {
        projectId: args.projectId,
        prompt: args.prompt,
        models: args.models,
        highlightBrand: args.highlightBrand,
        webSearch: args.webSearch ?? true,
        webSearchCountryCode: args.webSearchCountryCode,
      },
      context.billing,
    );

    const mentioned = result.results.filter(
      (r) => r.status === "success" && r.brandMentioned,
    ).length;
    const text = `Prompt explored across ${result.results.length} model(s)${args.highlightBrand ? `; "${args.highlightBrand}" mentioned in ${mentioned}/${result.results.length}` : ""}. Full text, citations, and per-model status are in structuredContent.result.`;

    return mcpResponse({
      text,
      meta: buildProjectMeta(context, args.projectId),
      structuredContent: { result },
    });
  }),
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/mcp/tools/explore-prompt.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/mcp/tools/explore-prompt.ts src/server/mcp/tools/explore-prompt.test.ts
git commit -m "Add explore_prompt MCP tool wrapping Prompt Explorer"
```

---

### Task 2: `lookup_brand` MCP tool

**Files:**
- Create: `src/server/mcp/tools/lookup-brand.ts`
- Create: `src/server/mcp/tools/lookup-brand.test.ts`

**Interfaces:**
- Consumes: `getBrandLookup(input: BrandLookupInput, billingCustomer: BillingCustomerContext): Promise<BrandLookupResult>` from `@/server/features/ai-search/services/brandLookup`; `BRAND_LOOKUP_MAX_INPUT_LENGTH` (250) from `@/types/schemas/ai-search`; same shared MCP helpers as Task 1.
- Produces: `lookupBrandTool` (named export), an `OpenSeoToolDefinition` with `name: "lookup_brand"` — consumed by Task 3.

- [ ] **Step 1: Write the failing test**

```typescript
// src/server/mcp/tools/lookup-brand.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { lookupBrandTool } from "./lookup-brand";
import { makeToolContext } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  getBrandLookup: vi.fn(),
}));

vi.mock("@/server/features/ai-search/services/brandLookup", () => ({
  getBrandLookup: mocks.getBrandLookup,
}));

vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: vi.fn().mockResolvedValue({ id: "project_1" }),
  },
}));

const toolContext = makeToolContext();

describe("lookup_brand MCP tool", () => {
  beforeEach(() => {});

  it("forwards validated input and billing context to getBrandLookup", async () => {
    mocks.getBrandLookup.mockResolvedValue({
      query: "klaussa",
      resolvedTarget: "klaussa.com",
      hasData: true,
      platforms: [],
      shareOfVoice: { platforms: [], entries: [] },
    });

    const result = await lookupBrandTool.handler(
      {
        projectId: "project_1",
        query: "klaussa",
        competitors: ["hukumonline.com"],
        locationCode: 2360,
        languageCode: "id",
      },
      toolContext,
    );

    expect(mocks.getBrandLookup).toHaveBeenCalledWith(
      {
        projectId: "project_1",
        query: "klaussa",
        competitors: ["hukumonline.com"],
        locationCode: 2360,
        languageCode: "id",
      },
      { userId: "user_123", userEmail: "alice@example.com", organizationId: "org_123", projectId: "project_1" },
    );
    expect(result.structuredContent?.result).toMatchObject({
      resolvedTarget: "klaussa.com",
      hasData: true,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/mcp/tools/lookup-brand.test.ts`
Expected: FAIL — `Cannot find module './lookup-brand'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/server/mcp/tools/lookup-brand.ts
import { z } from "zod";
import { getBrandLookup } from "@/server/features/ai-search/services/brandLookup";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import {
  languageCodeSchema,
  locationCodeSchema,
  projectIdSchema,
} from "@/server/mcp/schemas";
import { BRAND_LOOKUP_MAX_INPUT_LENGTH } from "@/types/schemas/ai-search";

const MAX_COMPETITORS = 5;

const inputSchema = {
  projectId: projectIdSchema,
  query: z
    .string()
    .trim()
    .min(1)
    .max(BRAND_LOOKUP_MAX_INPUT_LENGTH)
    .describe("Brand name or domain to look up AI-search visibility for."),
  competitors: z
    .array(z.string().trim().min(1).max(BRAND_LOOKUP_MAX_INPUT_LENGTH))
    .max(MAX_COMPETITORS)
    .optional()
    .describe(
      "Up to 5 competitor brands/domains to compare Share of Voice against.",
    ),
  locationCode: locationCodeSchema.optional(),
  languageCode: languageCodeSchema.optional(),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const lookupBrandTool = {
  name: "lookup_brand",
  config: {
    title: "Look up a brand's AI-search visibility",
    description:
      "Check how often a brand/domain is mentioned by ChatGPT (US-only) and Google AI Overview, and its Share of Voice against named competitors. Uses DataForSEO's paid LLM Mentions API. Cached 24h.",
    inputSchema,
    outputSchema: z
      .object({
        result: looseObjectOutputSchema,
        ...optionalMetaOutputSchema,
      })
      .passthrough(),
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const result = await getBrandLookup(
      {
        projectId: args.projectId,
        query: args.query,
        competitors: args.competitors ?? [],
        locationCode: args.locationCode ?? 2840,
        languageCode: args.languageCode ?? "en",
      },
      context.billing,
    );

    const text = `Brand lookup for "${args.query}"${result.hasData ? "" : " — no AI-search data found"}. Full per-platform mentions and Share of Voice are in structuredContent.result.`;

    return mcpResponse({
      text,
      meta: buildProjectMeta(context, args.projectId),
      structuredContent: { result },
    });
  }),
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/mcp/tools/lookup-brand.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/mcp/tools/lookup-brand.ts src/server/mcp/tools/lookup-brand.test.ts
git commit -m "Add lookup_brand MCP tool wrapping Brand Lookup"
```

---

### Task 3: Register both tools in the MCP server

**Files:**
- Modify: `src/server/mcp/server.ts:64` (import block, after the `site-audit-tools` import) and `:196` (after `register(getAuditPagesTool);`)

**Interfaces:**
- Consumes: `explorePromptTool` from Task 1, `lookupBrandTool` from Task 2.
- Produces: nothing new — this wires the two tools into the live `createOpenSeoMcpServer()` tool list.

- [ ] **Step 1: Add the imports**

In `src/server/mcp/server.ts`, immediately after the existing `site-audit-tools` import block:

```typescript
import { explorePromptTool } from "@/server/mcp/tools/explore-prompt";
import { lookupBrandTool } from "@/server/mcp/tools/lookup-brand";
```

- [ ] **Step 2: Register the tools**

Immediately after `register(getAuditPagesTool);`:

```typescript
  register(explorePromptTool);
  register(lookupBrandTool);
```

- [ ] **Step 3: Run the full test suite to verify nothing broke**

Run: `pnpm vitest run src/server/mcp/`
Expected: PASS (all existing MCP tests plus the two new ones from Tasks 1-2)

- [ ] **Step 4: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/server/mcp/server.ts
git commit -m "Register explore_prompt and lookup_brand MCP tools"
```

---

### Task 4: Deploy the updated OpenSEO self-host instance

**Files:** none (deploy-only task)

**Interfaces:**
- Consumes: the two registered tools from Task 3.
- Produces: a live self-hosted OpenSEO deployment exposing `explore_prompt` and `lookup_brand` over MCP — consumed by the `geo-citation.md` job prompt in Task 7.

- [ ] **Step 1: Verify Alchemy OAuth is still valid**

Run: `grep -q "access:write" ~/.alchemy/profiles.json && echo OK`
Expected: `OK`. If not, this needs the user to run `pnpm alchemy login --configure` interactively (cannot be done headlessly — see spec's gotchas doc `feedback_gotchas_openseo_selfhost` memory). Stop and ask the user if this fails.

- [ ] **Step 2: Deploy**

Run: `COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm run deploy:selfhost --yes`
Expected: exits 0, prints the deployed Worker URL.

- [ ] **Step 3: Verify the new tools are live**

Run (from any directory with the `openseo` MCP server configured — this repo's `.mcp.json`):
```bash
claude mcp get openseo
```
Expected: `Status: ✔ Connected`. Then, in a Claude Code session with the `openseo` MCP tools loaded, confirm `mcp__openseo__explore_prompt` and `mcp__openseo__lookup_brand` appear via `ToolSearch` (may require restarting the session per the earlier finding that MCP tool lists don't hot-reload mid-session).

- [ ] **Step 4: Commit (deploy has no file changes, but tag the milestone)**

No commit needed — this task deploys already-committed code. Proceed to Task 5.

---

### Task 5: Scaffold `seo-geo-cron/` directory and job prompt files

**Files:**
- Create: `seo-geo-cron/prompts/technical-health.md`
- Create: `seo-geo-cron/prompts/ranking-content.md`
- Create: `seo-geo-cron/prompts/geo-citation.md`
- Create: `seo-geo-cron/run.sh`
- Create: `seo-geo-cron/data/.gitkeep`
- Modify: `.gitignore` (add `seo-geo-cron/data/*.sqlite` and `seo-geo-cron/klaussa_fe-workspace/`)

**Interfaces:**
- Consumes: OpenSEO project ID `60bfa4e0-fc18-452a-845b-70c99f82644e` (klaussa.com, from earlier MCP calls this session), the guardrails from spec §8, the decision rules from spec §7.
- Produces: three prompt files and a runner script — consumed by Task 6's crontab entries.

- [ ] **Step 1: Create the data directory placeholder**

```bash
mkdir -p seo-geo-cron/data seo-geo-cron/prompts
touch seo-geo-cron/data/.gitkeep
```

- [ ] **Step 2: Add gitignore entries**

Append to `.gitignore`:
```
seo-geo-cron/data/*.sqlite
seo-geo-cron/klaussa_fe-workspace/
```

- [ ] **Step 3: Write `seo-geo-cron/prompts/technical-health.md`**

```markdown
# Technical Health job

You are the automated Technical Health agent for klaussa.com (OpenSEO
project ID `60bfa4e0-fc18-452a-845b-70c99f82644e`). You run daily, unattended.

## What to do

1. Call the `openseo` MCP tool `run_site_audit` with
   `projectId: "60bfa4e0-fc18-452a-845b-70c99f82644e"`,
   `url: "https://klaussa.com"`, default `maxPages` (50) and
   `runLighthouse: true`.
2. Poll `get_audit_status` (same projectId/auditId) every ~15 seconds until
   `status` is `"completed"` or `"failed"`.
3. Call `get_audit_issues` for the full issue report.

## Decision rules

- **Broken internal links, broken pages (4xx), meta-description-too-long,
  title-too-long, missing-h1, or templated schema gaps** where the same fix
  clearly applies across repeated occurrences (e.g. one dead nav/footer
  link target hit from many pages) → **auto-fix, open a PR.**
  - Work in `~/klaussa-lab/seo-geo-cron/klaussa_fe-workspace/` (already
    cloned). `git checkout main && git pull`. Create branch
    `self-heal-technical-health-<YYYYMMDD>`.
  - Only touch the specific files needed for the fix (e.g. the shared
    nav/footer component, or the specific page's meta tags). Never touch
    files under `auth/`, `billing/`, `.github/workflows/`, or any
    `*migration*`/`*schema*` path — if the fix seems to require touching
    one of those, escalate instead (see below).
  - Commit, push, then `gh pr create --repo klaussaindonesia/klaussa_fe --base
    main --head self-heal-technical-health-<YYYYMMDD> --title "..." --body
    "..."`. The PR body must state the audit ID and list every issue
    fixed with its issueType.
  - Max **one** PR per run. If more distinct fixes are found than fit in
    one coherent PR, fix the highest-severity/highest-count cluster this
    run and leave the rest for tomorrow's run.
- **Server errors (5xx), failed Lighthouse checks, slow-response pages, or
  any issue whose fix is unclear or touches a guardrailed path** →
  **escalate.** Run `gh issue create --repo klaussaindonesia/klaussa_fe --label
  seo-geo-escalation --title "[SEO/GEO] <short summary>" --body "<audit ID,
  affected URLs, the raw issue data, why this needs a human>"`. Max **one**
  issue per run — bundle related findings (e.g. all 503s) into one issue.
- **Info-level cosmetic issues with no clear actionable fix** → do nothing
  (pass).
- Never force-push. Never merge your own PR. Never run `gh pr merge`.

## Traceability

Every PR/issue body must include the OpenSEO audit ID it was generated
from, so a human can trace the decision back to the source data.
```

- [ ] **Step 4: Write `seo-geo-cron/prompts/ranking-content.md`**

```markdown
# Ranking & Content job

You are the automated Ranking & Content agent for klaussa.com (OpenSEO
project ID `60bfa4e0-fc18-452a-845b-70c99f82644e`). You run weekly,
unattended.

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
  note the correlation in the content PR/issue instead of re-diagnosing.
  If no technical cause, this is a content-refresh case (see PR steps
  below).
- **Ranking at position 4-15 with real impressions but low CTR (under
  ~2%)** → snippet/FAQ opportunity. Draft a direct-answer/FAQ block for
  that page.
- **A competitor outranks us for a tracked keyword** → highest priority.
  Fetch the competitor's ranking page (WebFetch or `get_serp_results`),
  diff its content against ours, draft content that closes the gap.
- **High-volume keyword (use `get_keyword_metrics`/`research_keywords` to
  check volume) we don't rank for at all** → draft a new post/hub page.
- For every content action: work in
  `~/klaussa-lab/seo-geo-cron/klaussa_fe-workspace/`, branch
  `content-ranking-<slug>-<YYYYMMDD>`, add a **new file** under the site's
  content/blog directory (never edit an existing published page directly).
  Write the actual publishable content, not a brief — the human reviewing
  the PR will QA it, not expand it. Commit, push, `gh pr create --draft`.
  Max **one** PR per run — pick the single highest-priority action from
  the rules above.
- Never force-push. Never merge your own PR.

## Traceability

Every PR body must include the GSC date range and (if used) the rank
tracker snapshot date the decision was based on.
```

- [ ] **Step 5: Write `seo-geo-cron/prompts/geo-citation.md`**

```markdown
# GEO / AI-citation job

You are the automated GEO agent for klaussa.com (OpenSEO project ID
`60bfa4e0-fc18-452a-845b-70c99f82644e`). You run weekly, unattended, an
hour after the Ranking & Content job.

## What to do

1. Read `~/klaussa-lab/seo-geo-cron/data/geo-history.sqlite`. If it
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
  Optionally reinforce that page in a draft content PR if there's an
  obvious easy win; otherwise pass.
- **A competitor is cited and we're not, for the same prompt** →
  **highest priority.** Diff the competitor's cited page against our
  closest equivalent page, draft content closing the gap. Same PR
  conventions as the ranking-content job (new file, draft PR, branch
  `content-geo-<slug>-<YYYYMMDD>`).
- **We're cited but the cited text contains information that looks wrong
  or outdated** (cross-check against the actual current page content) →
  **escalate immediately**, no auto-fix. Factual correctness needs a
  human. Issue title "[SEO/GEO] possible wrong info cited: <prompt>".
- **Share-of-voice for a query has dropped compared to the last 2+ prior
  `geo_runs` rows for that query** → escalate as one digest issue
  covering all queries with a drop this run, no auto-fix.
- **Zero citations for anyone on a prompt** → pass, deprioritize.
- Max **one** PR and **one** issue per run, same as the other jobs.
  Never force-push, never self-merge.

## Traceability

Every PR/issue body must include the run date and the specific
prompt/query + model/platform the decision was based on.
```

- [ ] **Step 6: Write `seo-geo-cron/run.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Usage: ./run.sh <technical-health|ranking-content|geo-citation>
JOB="${1:?Usage: run.sh <technical-health|ranking-content|geo-citation>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMPT_FILE="$SCRIPT_DIR/prompts/$JOB.md"

if [ ! -f "$PROMPT_FILE" ]; then
  echo "No such job prompt: $PROMPT_FILE" >&2
  exit 1
fi

cd "$SCRIPT_DIR/.."
git pull -q

claude -p "$(cat "$PROMPT_FILE")" \
  --dangerously-skip-permissions \
  2>&1 | tee -a "$SCRIPT_DIR/data/$JOB.log"
```

- [ ] **Step 7: Make it executable and commit**

```bash
chmod +x seo-geo-cron/run.sh
git add seo-geo-cron/ .gitignore
git commit -m "Scaffold seo-geo-cron/ job prompts and runner script"
```

---

### Task 6: Desktop host setup

**Files:** none in this repo — this task configures the remote host `ez@100.120.136.18` (alias `fiskal-vps`).

**Interfaces:**
- Consumes: `seo-geo-cron/run.sh` and the three prompt files from Task 5, already pushed to the repo's remote (this task requires Task 5's commit to be pushed first).
- Produces: a working crontab on the desktop host that runs all three jobs — the final deliverable of this plan.

- [ ] **Step 1: Push this branch's commits so the desktop can pull them**

```bash
git push -u origin worktree-seo-geo-cron-spec
```
(Or merge to the branch the desktop's `~/autoseo` clone tracks — confirm with the user which branch the desktop should pull before proceeding, since `~/autoseo` doesn't exist on the desktop yet per Task 2's earlier inspection — it needs to be cloned fresh.)

- [ ] **Step 2: Unlock SSH access (same method used earlier this session)**

```bash
eval $(ssh-agent -s) >/dev/null
SSH_ASKPASS_SCRIPT=$(mktemp)
cat > "$SSH_ASKPASS_SCRIPT" <<'EOF'
#!/bin/sh
echo "31415"
EOF
chmod +x "$SSH_ASKPASS_SCRIPT"
export SSH_ASKPASS="$SSH_ASKPASS_SCRIPT"
export SSH_ASKPASS_REQUIRE=force
setsid ssh-add ~/.ssh/id_fiskal_vps < /dev/null 2>&1
rm -f "$SSH_ASKPASS_SCRIPT"
ssh-add -l
```
Expected: `fiskallink-vps-deploy` key listed.

- [ ] **Step 3: Install pnpm on the desktop**

```bash
ssh fiskal-vps "corepack enable pnpm 2>&1 || npm install -g pnpm; pnpm --version"
```
Expected: prints a pnpm version, exit 0.

- [ ] **Step 4: Clone `autoseo` and `klaussa_fe` on the desktop**

Confirmed repo identities (checked via `gh repo list klaussaindonesia` on
the desktop): `every-app/open-seo` (this repo) and
`klaussaindonesia/klaussa_fe`.

```bash
ssh fiskal-vps "mkdir -p ~/klaussa-lab/seo-geo-cron && \
  cd ~/klaussa-lab/seo-geo-cron && \
  gh repo clone every-app/open-seo autoseo && \
  git -C autoseo checkout worktree-seo-geo-cron-spec && \
  gh repo clone klaussaindonesia/klaussa_fe klaussa_fe-workspace"
```
Expected: both clones succeed, exit 0.

- [ ] **Step 5: Verify `gh` auth works against the klaussa_fe clone**

```bash
ssh fiskal-vps "cd ~/klaussa-lab/seo-geo-cron/klaussa_fe-workspace && gh repo view --json nameWithOwner"
```
Expected: prints `klaussaindonesia/klaussa_fe`, confirming `gh` can act on it.

- [ ] **Step 6: Do a manual dry run of each job before trusting the schedule**

```bash
ssh fiskal-vps "cd ~/klaussa-lab/seo-geo-cron/autoseo/seo-geo-cron && ./run.sh technical-health"
```
Read the output. Confirm it either opened a PR/issue as expected given the current audit state, or correctly passed. Repeat for `ranking-content` and `geo-citation` (the latter is expected to escalate "GEO prompt set not configured" per Task 5 Step 5's rule, since prompt seeding is out of scope for this plan — that escalation firing correctly IS the expected/passing outcome here).

- [ ] **Step 7: Install the crontab entries**

```bash
ssh fiskal-vps "(crontab -l 2>/dev/null; echo '17 6 * * * cd ~/klaussa-lab/seo-geo-cron/autoseo/seo-geo-cron && ./run.sh technical-health'; echo '43 6 * * 1 cd ~/klaussa-lab/seo-geo-cron/autoseo/seo-geo-cron && ./run.sh ranking-content'; echo '22 7 * * 1 cd ~/klaussa-lab/seo-geo-cron/autoseo/seo-geo-cron && ./run.sh geo-citation') | crontab -"
```

- [ ] **Step 8: Verify the crontab**

```bash
ssh fiskal-vps "crontab -l"
```
Expected: shows the existing warmup entry plus the three new entries.

---

### Task 7: Follow-up items (not implemented in this plan)

No files touched — this task is a status report, not code.

- [ ] **Step 1: Confirm out-of-scope items with the user**

State clearly to the user, referencing spec §6 and §9 step 3:
1. **Rank tracker is still unconfigured** — Task 6's dry run of
   `ranking-content` will have skipped rank-drop/competitor-outranks
   analysis and opened a "rank tracker not configured" escalation issue.
   This needs a separate session in the OpenSEO UI to seed target
   keywords and competitors (Hukumonline, JDIH, Legalku).
2. **GEO prompt set is still unconfigured** — Task 6's dry run of
   `geo-citation` will have escalated "GEO prompt set not configured".
   Needs the ~50-prompt ID-language list finalized and written to
   `seo-geo-cron/data/prompts.json` (format: `["prompt 1", "prompt 2", ...]`).
3. **Multi-week monitoring** (spec §9 step 6: checking real DataForSEO
   spend against the estimate, checking PR/issue quality, tightening
   guardrails) has not started — begins once the crontab entries fire
   for real over the next 1-2 weeks.

Do not implement these in this task — surface them so the user can decide
priority and timing.
