# SEO Pipeline Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A read-only "SEO Pipeline" page under OpenSEO's "My Site" nav, with four tabs (Overview, Content Actions, Keyword Coverage, Outcomes) that make the cron's keyword → blog → indexed? → ranked pipeline explicit inside the dashboard.

**Architecture:** New project-scoped table (`klaussa_content_actions`, dual SQLite/Postgres schema per this repo's parity convention) + a `record_content_action` MCP tool the cron dual-writes to alongside its existing local `actions.sqlite` writes + a repository/service/server-function stack + one route with search-param-driven tabs.

**Tech Stack:** Drizzle (sqliteTable + pgTable, parity-tested), TanStack Start server functions, TanStack Router/Query, DaisyUI tab classes, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-27-seo-pipeline-dashboard-design.md`

## Global Constraints

- **Klaussa-specific by explicit decision** — no generic "content action" abstraction. Table name `klaussa_content_actions`, blog-shaped fields.
- **Read-only page.** No mutations from the UI. Approve/reject/request-indexing keep their existing paths (review email, GSC).
- **Dual-write, never migrate.** `actions.sqlite` stays the cron's source of truth; D1 is a mirror. A failed mirror write must never block or alter the local write.
- **Schema parity is enforced by a test.** Every table added to `src/db/*.schema.ts` MUST have a structurally identical `src/db/pg/*.schema.ts` twin, and both must be registered in `schema-parity.test.ts`'s `tablesFrom(...)` calls, or the suite fails.
- **Upsert key is `blogId`** (unique index), matching `GscConnectionRepository.upsert`'s `onConflictDoUpdate` pattern.
- **`status` enum:** `drafted | proposed | published | rejected | judged`. **`outcome` enum:** `improved | flat | worse` (rejected lives in `status`, never in `outcome`).
- Timestamps are **text**, defaulting to `sql\`(current_timestamp)\`` (SQLite) and the `isoNow` expression (Postgres) — copy `gsc.schema.ts` / `pg/gsc.schema.ts` exactly.

---

## Task 1: Dual-dialect schema + parity registration

**Files:**
- Create: `src/db/klaussa-content-actions.schema.ts`
- Create: `src/db/pg/klaussa-content-actions.schema.ts`
- Modify: `src/db/schema.ts` (barrel: import, type union, runtime spread, export list)
- Modify: `src/db/pg/schema.ts` (add `export * from`)
- Modify: `src/db/schema-parity.test.ts` (imports + both `tablesFrom(...)` calls)

**Interfaces:**
- Produces: `klaussaContentActions` table, exported from `@/db/schema`. Task 2's repository imports it from there.

- [ ] **Step 1: Create the SQLite schema**

```typescript
// src/db/klaussa-content-actions.schema.ts
import { sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { projects } from "./app.schema";

// Mirror of the SEO/GEO cron's local `seo-geo-cron/data/actions.sqlite`, which
// lives on the machine running the cron and is invisible to this app. The cron
// dual-writes each row here via the `record_content_action` MCP tool so the
// dashboard can show the pipeline. `actions.sqlite` stays the cron's own source
// of truth; this table is a read-only mirror for reporting.
export const klaussaContentActions = sqliteTable(
  "klaussa_content_actions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    job: text("job").notNull(),
    runDate: text("run_date").notNull(),
    clusterTopic: text("cluster_topic").notNull(),
    // JSON array as text: matches actions.sqlite's own convention and keeps the
    // two dialects textually identical for the parity test.
    clusterKeywords: text("cluster_keywords").notNull(),
    // The existing page that prompted this candidate (exclusion key upstream).
    sourcePageUrl: text("source_page_url"),
    // The page the action actually produced -- what outcome judging measures.
    targetPageUrl: text("target_page_url"),
    actionType: text("action_type").notNull(),
    blogId: text("blog_id").notNull(),
    blogUrl: text("blog_url"),
    baselineMetrics: text("baseline_metrics"),
    status: text("status").notNull(),
    outcome: text("outcome"),
    outcomeMetrics: text("outcome_metrics"),
    indexedAt: text("indexed_at"),
    // Verbatim inspectionResultLink from inspect_urls: a real pre-filled Search
    // Console URL. Stored so the dashboard never re-calls Google to render it.
    indexingLink: text("indexing_link"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    judgedAt: text("judged_at"),
  },
  (table) => [
    // The upsert target: one row per blog, updated in place as it moves
    // drafted -> proposed -> published -> indexed -> judged.
    uniqueIndex("klaussa_content_actions_blog_idx").on(table.blogId),
    index("klaussa_content_actions_project_status_idx").on(
      table.projectId,
      table.status,
    ),
  ],
);
```

- [ ] **Step 2: Create the Postgres twin**

```typescript
// src/db/pg/klaussa-content-actions.schema.ts
import { sql } from "drizzle-orm";
import { index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { projects } from "./app.schema";

// See src/db/pg/app.schema.ts for why timestamps are ISO-8601 UTC text.
const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

// Postgres twin of src/db/klaussa-content-actions.schema.ts. Kept structurally
// identical -- schema-parity.test.ts fails the moment these drift.
export const klaussaContentActions = pgTable(
  "klaussa_content_actions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    job: text("job").notNull(),
    runDate: text("run_date").notNull(),
    clusterTopic: text("cluster_topic").notNull(),
    clusterKeywords: text("cluster_keywords").notNull(),
    sourcePageUrl: text("source_page_url"),
    targetPageUrl: text("target_page_url"),
    actionType: text("action_type").notNull(),
    blogId: text("blog_id").notNull(),
    blogUrl: text("blog_url"),
    baselineMetrics: text("baseline_metrics"),
    status: text("status").notNull(),
    outcome: text("outcome"),
    outcomeMetrics: text("outcome_metrics"),
    indexedAt: text("indexed_at"),
    indexingLink: text("indexing_link"),
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
    judgedAt: text("judged_at"),
  },
  (table) => [
    uniqueIndex("klaussa_content_actions_blog_idx").on(table.blogId),
    index("klaussa_content_actions_project_status_idx").on(
      table.projectId,
      table.status,
    ),
  ],
);
```

- [ ] **Step 3: Register in both barrels**

In `src/db/schema.ts`, four edits (follow the existing `sqliteGsc`/`pgGsc` lines as the model):
1. `import * as sqliteKlaussaContentActions from "./klaussa-content-actions.schema";` (after the `sqliteTelemetry` import)
2. `import * as pgKlaussaContentActions from "./pg/klaussa-content-actions.schema";` (after the `pgTelemetry` import)
3. Add `& typeof sqliteKlaussaContentActions` to the `AppSchema` type union.
4. Add `...pgKlaussaContentActions,` to the postgres branch and `...sqliteKlaussaContentActions,` to the sqlite branch of `runtimeSchema`, then add `klaussaContentActions,` to the destructured `export const { ... }` list.

In `src/db/pg/schema.ts`, add:
```typescript
export * from "./klaussa-content-actions.schema";
```

- [ ] **Step 4: Register in the parity test**

In `src/db/schema-parity.test.ts`: add `import * as sqliteKlaussaContentActions from "./klaussa-content-actions.schema";` and `import * as pgKlaussaContentActions from "./pg/klaussa-content-actions.schema";` alongside the existing imports, then add `sqliteKlaussaContentActions,` to the `sqliteAppTables = tablesFrom(...)` call and `pgKlaussaContentActions,` to `pgAppTables = tablesFrom(...)`.

- [ ] **Step 5: Run the parity test — this is the real verification**

Run: `npx vitest run src/db/schema-parity.test.ts`
Expected: PASS. This test is the whole safety net for the dual-schema approach — it compares columns, nullability, defaults, PKs, unique constraints, and FKs across both dialects. If the two files drifted in any way, it fails here with the specific mismatch.

- [ ] **Step 6: Generate migrations**

Run: `npm run db:generate`
Expected: new migration files in both `drizzle/` and `drizzle-pg/`. Inspect the generated SQL for the new table and confirm it contains `klaussa_content_actions` with the unique index on `blog_id`.

- [ ] **Step 7: Commit**

```bash
git add src/db/klaussa-content-actions.schema.ts src/db/pg/klaussa-content-actions.schema.ts src/db/schema.ts src/db/pg/schema.ts src/db/schema-parity.test.ts drizzle/ drizzle-pg/
git commit -m "Add klaussa_content_actions table (dual-dialect, parity-tested)"
```

---

## Task 2: Repository + service

**Files:**
- Create: `src/server/features/content-pipeline/repositories/ContentActionRepository.ts`
- Create: `src/server/features/content-pipeline/services/ContentPipelineService.ts`
- Create: `src/server/features/content-pipeline/services/ContentPipelineService.test.ts`

**Interfaces:**
- Consumes: `klaussaContentActions` from `@/db/schema` (Task 1).
- Produces:
  - `ContentActionRepository.upsert(input): Promise<ContentAction>`, `.listByProject(projectId): Promise<ContentAction[]>`
  - `ContentPipelineService.recordAction(input): Promise<{blogId, created}>` — Task 3's MCP tool calls this.
  - `ContentPipelineService.getPipeline(projectId): Promise<PipelineData>` — Task 4's server function calls this. `PipelineData` shape is defined in Step 3 below and consumed by Task 5's UI.

**Design note (read before implementing):** one `getPipeline` call returns everything all four tabs need, rather than four separate service methods and four round-trips. At this scale (hundreds of rows) a single `listByProject` read plus in-memory shaping is simpler, avoids four near-identical queries, and means switching tabs is instant with no refetch. The spec described four methods; this is the same data, assembled once — a deliberate simplification, not a scope change.

- [ ] **Step 1: Write the repository**

```typescript
// src/server/features/content-pipeline/repositories/ContentActionRepository.ts
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { klaussaContentActions } from "@/db/schema";

export type ContentAction = typeof klaussaContentActions.$inferSelect;

export type ContentActionInput = {
  projectId: string;
  job: string;
  runDate: string;
  clusterTopic: string;
  clusterKeywords: string;
  sourcePageUrl: string | null;
  targetPageUrl: string | null;
  actionType: string;
  blogId: string;
  blogUrl: string | null;
  baselineMetrics: string | null;
  status: string;
  outcome: string | null;
  outcomeMetrics: string | null;
  indexedAt: string | null;
  indexingLink: string | null;
  judgedAt: string | null;
};

/**
 * Upsert by blogId: the cron calls this repeatedly for the same blog as it
 * moves through drafted -> proposed -> published -> indexed -> judged, always
 * holding the full current row state. Null incoming values must NOT clobber a
 * previously-set value (a later status write does not resend the baseline
 * captured at draft time), so nullable columns coalesce.
 */
async function upsert(input: ContentActionInput): Promise<ContentAction> {
  const [row] = await db
    .insert(klaussaContentActions)
    .values({ id: crypto.randomUUID(), ...input })
    .onConflictDoUpdate({
      target: klaussaContentActions.blogId,
      set: {
        projectId: input.projectId,
        job: input.job,
        runDate: input.runDate,
        clusterTopic: input.clusterTopic,
        clusterKeywords: input.clusterKeywords,
        actionType: input.actionType,
        status: input.status,
        sourcePageUrl: sql`coalesce(${input.sourcePageUrl}, ${klaussaContentActions.sourcePageUrl})`,
        targetPageUrl: sql`coalesce(${input.targetPageUrl}, ${klaussaContentActions.targetPageUrl})`,
        blogUrl: sql`coalesce(${input.blogUrl}, ${klaussaContentActions.blogUrl})`,
        baselineMetrics: sql`coalesce(${input.baselineMetrics}, ${klaussaContentActions.baselineMetrics})`,
        outcome: sql`coalesce(${input.outcome}, ${klaussaContentActions.outcome})`,
        outcomeMetrics: sql`coalesce(${input.outcomeMetrics}, ${klaussaContentActions.outcomeMetrics})`,
        indexedAt: sql`coalesce(${input.indexedAt}, ${klaussaContentActions.indexedAt})`,
        indexingLink: sql`coalesce(${input.indexingLink}, ${klaussaContentActions.indexingLink})`,
        judgedAt: sql`coalesce(${input.judgedAt}, ${klaussaContentActions.judgedAt})`,
        updatedAt: sql`(current_timestamp)`,
      },
    })
    .returning();
  if (!row) {
    throw new Error("Failed to upsert klaussa_content_action");
  }
  return row;
}

async function listByProject(projectId: string): Promise<ContentAction[]> {
  return db
    .select()
    .from(klaussaContentActions)
    .where(eq(klaussaContentActions.projectId, projectId))
    .orderBy(desc(klaussaContentActions.createdAt));
}

export const ContentActionRepository = { upsert, listByProject };
```

- [ ] **Step 2: Write the failing service tests**

```typescript
// src/server/features/content-pipeline/services/ContentPipelineService.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContentPipelineService } from "./ContentPipelineService";
import type { ContentAction } from "../repositories/ContentActionRepository";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  listByProject: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("../repositories/ContentActionRepository", () => ({
  ContentActionRepository: {
    upsert: mocks.upsert,
    listByProject: mocks.listByProject,
  },
}));

function action(overrides: Partial<ContentAction> = {}): ContentAction {
  return {
    id: "a1",
    projectId: "p1",
    job: "seo",
    runDate: "2026-08-27",
    clusterTopic: "MoU vs PKS",
    clusterKeywords: JSON.stringify(["apa itu pks"]),
    sourcePageUrl: null,
    targetPageUrl: "https://klaussa.com/blog/mou-vs-pks",
    actionType: "companion-post",
    blogId: "b1",
    blogUrl: "https://klaussa.com/blog/mou-vs-pks",
    baselineMetrics: null,
    status: "proposed",
    outcome: null,
    outcomeMetrics: null,
    indexedAt: null,
    indexingLink: null,
    createdAt: "2026-08-27T10:00:00.000Z",
    updatedAt: "2026-08-27T10:00:00.000Z",
    judgedAt: null,
    ...overrides,
  } as ContentAction;
}

beforeEach(() => {
  mocks.listByProject.mockResolvedValue([]);
});

describe("getPipeline funnel", () => {
  it("counts each stage cumulatively: a judged row counts as drafted, published and indexed too", async () => {
    mocks.listByProject.mockResolvedValue([
      action({ blogId: "b1", status: "judged", indexedAt: "2026-08-20", outcome: "improved" }),
    ]);

    const result = await ContentPipelineService.getPipeline("p1");

    expect(result.funnel.drafted.total).toBe(1);
    expect(result.funnel.published.total).toBe(1);
    expect(result.funnel.indexed.total).toBe(1);
    expect(result.funnel.judged.total).toBe(1);
  });

  it("does not count an unpublished draft as published", async () => {
    mocks.listByProject.mockResolvedValue([
      action({ blogId: "b1", status: "proposed" }),
    ]);

    const result = await ContentPipelineService.getPipeline("p1");

    expect(result.funnel.drafted.total).toBe(1);
    expect(result.funnel.published.total).toBe(0);
    expect(result.funnel.indexed.total).toBe(0);
  });
});

describe("getPipeline attention list", () => {
  it("lists proposed rows as pending approval", async () => {
    mocks.listByProject.mockResolvedValue([
      action({ blogId: "b1", status: "proposed" }),
    ]);

    const result = await ContentPipelineService.getPipeline("p1");

    expect(result.attention.pendingApproval).toHaveLength(1);
    expect(result.attention.pendingApproval[0].blogId).toBe("b1");
  });

  it("flags a published-but-unindexed row and carries its indexing link", async () => {
    mocks.listByProject.mockResolvedValue([
      action({
        blogId: "b1",
        status: "published",
        indexedAt: null,
        indexingLink: "https://search.google.com/search-console/inspect?id=x",
      }),
    ]);

    const result = await ContentPipelineService.getPipeline("p1");

    expect(result.attention.awaitingIndexing).toHaveLength(1);
    expect(result.attention.awaitingIndexing[0].indexingLink).toBe(
      "https://search.google.com/search-console/inspect?id=x",
    );
  });

  it("does not flag an already-indexed page as awaiting indexing", async () => {
    mocks.listByProject.mockResolvedValue([
      action({ blogId: "b1", status: "published", indexedAt: "2026-08-26" }),
    ]);

    const result = await ContentPipelineService.getPipeline("p1");

    expect(result.attention.awaitingIndexing).toHaveLength(0);
  });
});

describe("getPipeline outcomes", () => {
  it("includes only judged rows and diffs both ctr and position", async () => {
    mocks.listByProject.mockResolvedValue([
      action({
        blogId: "b1",
        status: "judged",
        outcome: "improved",
        baselineMetrics: JSON.stringify({ position: 12, ctr: 0.005 }),
        outcomeMetrics: JSON.stringify({ position: 8, ctr: 0.02 }),
      }),
      action({ blogId: "b2", status: "rejected" }),
      action({ blogId: "b3", status: "published" }),
    ]);

    const result = await ContentPipelineService.getPipeline("p1");

    expect(result.outcomes.rows).toHaveLength(1);
    expect(result.outcomes.rows[0].blogId).toBe("b1");
    expect(result.outcomes.rows[0].positionDelta).toBe(-4);
    expect(result.outcomes.rows[0].ctrDelta).toBeCloseTo(0.015);
  });

  it("tolerates missing or unparseable metrics without throwing", async () => {
    mocks.listByProject.mockResolvedValue([
      action({ blogId: "b1", status: "judged", outcome: "flat", baselineMetrics: null, outcomeMetrics: "not json" }),
    ]);

    const result = await ContentPipelineService.getPipeline("p1");

    expect(result.outcomes.rows[0].positionDelta).toBeNull();
    expect(result.outcomes.rows[0].ctrDelta).toBeNull();
  });
});

describe("getPipeline keyword coverage", () => {
  it("marks a keyword acted-on when any row's clusterKeywords contains it", async () => {
    mocks.listByProject.mockResolvedValue([
      action({ blogId: "b1", clusterKeywords: JSON.stringify(["apa itu pks", "pks adalah"]) }),
    ]);

    const result = await ContentPipelineService.getPipeline("p1");

    expect(result.keywordCoverage.actedOn).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ keyword: "apa itu pks", clusterTopic: "MoU vs PKS" }),
      ]),
    );
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/server/features/content-pipeline/`
Expected: FAIL — `ContentPipelineService` does not exist yet.

- [ ] **Step 4: Write the service**

```typescript
// src/server/features/content-pipeline/services/ContentPipelineService.ts
import {
  ContentActionRepository,
  type ContentAction,
  type ContentActionInput,
} from "../repositories/ContentActionRepository";

// A row reaches a stage if it is AT that stage or past it. Cumulative counts
// are what make the display read as a funnel rather than as disjoint buckets.
const PUBLISHED_OR_LATER = new Set(["published", "judged"]);
const DRAFTED_OR_LATER = new Set([
  "drafted",
  "proposed",
  "published",
  "rejected",
  "judged",
]);

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type Metrics = {
  position: number | null;
  ctr: number | null;
  impressions: number | null;
  clicks: number | null;
};

/** Stored metrics are LLM-authored JSON text; never let a bad blob throw. */
function parseMetrics(raw: string | null): Metrics | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Metrics>;
    return {
      position: typeof parsed.position === "number" ? parsed.position : null,
      ctr: typeof parsed.ctr === "number" ? parsed.ctr : null,
      impressions:
        typeof parsed.impressions === "number" ? parsed.impressions : null,
      clicks: typeof parsed.clicks === "number" ? parsed.clicks : null,
    };
  } catch {
    return null;
  }
}

function parseKeywords(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((k): k is string => typeof k === "string");
  } catch {
    return [];
  }
}

function delta(before: number | null, after: number | null): number | null {
  if (before === null || after === null) return null;
  return after - before;
}

function isRecent(timestamp: string | null, nowMs: number): boolean {
  if (!timestamp) return false;
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) return false;
  return nowMs - parsed < WEEK_MS;
}

/**
 * Each stage counts recency against its OWN timestamp -- "drafted this week"
 * means createdAt, "indexed this week" means indexedAt, "judged this week"
 * means judgedAt. A single shared timestamp would make later stages look as
 * busy as the first one.
 */
function stage(rows: ContentAction[], nowMs: number, recencyKey: keyof ContentAction) {
  return {
    total: rows.length,
    thisWeek: rows.filter((r) => isRecent(r[recencyKey] as string | null, nowMs))
      .length,
  };
}

export type PipelineData = ReturnType<typeof shape>;

function shape(actions: ContentAction[], nowMs: number) {
  const drafted = actions.filter((a) => DRAFTED_OR_LATER.has(a.status));
  const published = actions.filter((a) => PUBLISHED_OR_LATER.has(a.status));
  const indexed = actions.filter((a) => a.indexedAt !== null);
  const judged = actions.filter((a) => a.status === "judged");

  const outcomeRows = judged.map((a) => {
    const baseline = parseMetrics(a.baselineMetrics);
    const outcome = parseMetrics(a.outcomeMetrics);
    return {
      blogId: a.blogId,
      clusterTopic: a.clusterTopic,
      targetPageUrl: a.targetPageUrl,
      outcome: a.outcome,
      judgedAt: a.judgedAt,
      baselinePosition: baseline?.position ?? null,
      outcomePosition: outcome?.position ?? null,
      positionDelta: delta(baseline?.position ?? null, outcome?.position ?? null),
      baselineCtr: baseline?.ctr ?? null,
      outcomeCtr: outcome?.ctr ?? null,
      ctrDelta: delta(baseline?.ctr ?? null, outcome?.ctr ?? null),
    };
  });

  const actedOn = actions.flatMap((a) =>
    parseKeywords(a.clusterKeywords).map((keyword) => ({
      keyword,
      blogId: a.blogId,
      clusterTopic: a.clusterTopic,
      status: a.status,
      targetPageUrl: a.targetPageUrl,
    })),
  );

  return {
    funnel: {
      drafted: stage(drafted, nowMs, "createdAt"),
      published: stage(published, nowMs, "updatedAt"),
      indexed: stage(indexed, nowMs, "indexedAt"),
      judged: stage(judged, nowMs, "judgedAt"),
    },
    attention: {
      pendingApproval: actions
        .filter((a) => a.status === "proposed")
        .map((a) => ({
          blogId: a.blogId,
          clusterTopic: a.clusterTopic,
          runDate: a.runDate,
        })),
      awaitingIndexing: published
        .filter((a) => a.indexedAt === null)
        .map((a) => ({
          blogId: a.blogId,
          clusterTopic: a.clusterTopic,
          targetPageUrl: a.targetPageUrl,
          indexingLink: a.indexingLink,
        })),
      recentlyJudged: outcomeRows.filter((r) => isRecent(r.judgedAt, nowMs)),
    },
    actions: actions.map((a) => ({
      blogId: a.blogId,
      job: a.job,
      runDate: a.runDate,
      clusterTopic: a.clusterTopic,
      keywords: parseKeywords(a.clusterKeywords),
      actionType: a.actionType,
      status: a.status,
      targetPageUrl: a.targetPageUrl,
      sourcePageUrl: a.sourcePageUrl,
      indexedAt: a.indexedAt,
      indexingLink: a.indexingLink,
      outcome: a.outcome,
      createdAt: a.createdAt,
    })),
    keywordCoverage: { actedOn },
    outcomes: {
      rows: outcomeRows,
      improved: outcomeRows.filter((r) => r.outcome === "improved").length,
      flat: outcomeRows.filter((r) => r.outcome === "flat").length,
      worse: outcomeRows.filter((r) => r.outcome === "worse").length,
    },
  };
}

async function getPipeline(projectId: string) {
  const actions = await ContentActionRepository.listByProject(projectId);
  return shape(actions, Date.now());
}

async function recordAction(
  input: ContentActionInput,
): Promise<{ blogId: string; status: string }> {
  const row = await ContentActionRepository.upsert(input);
  return { blogId: row.blogId, status: row.status };
}

export const ContentPipelineService = { getPipeline, recordAction };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/server/features/content-pipeline/`
Expected: PASS, all tests.

- [ ] **Step 6: Commit**

```bash
git add src/server/features/content-pipeline/
git commit -m "Add ContentPipelineService + repository for the SEO pipeline mirror"
```

---

## Task 3: `record_content_action` MCP tool

**Files:**
- Create: `src/server/mcp/tools/record-content-action.ts`
- Modify: `src/server/mcp/server.ts` (import + `register(...)`)

**Interfaces:**
- Consumes: `ContentPipelineService.recordAction` (Task 2).
- Produces: the `record_content_action` MCP tool the cron calls (Task 6 wires the prompts to it).

- [ ] **Step 1: Write the tool**

```typescript
// src/server/mcp/tools/record-content-action.ts
import { z } from "zod";
import { ContentPipelineService } from "@/server/features/content-pipeline/services/ContentPipelineService";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";

const inputSchema = {
  projectId: projectIdSchema,
  job: z.enum(["seo", "geo"]).describe("Which cron job produced this action."),
  runDate: z.string().describe("Run date, YYYY-MM-DD."),
  clusterTopic: z
    .string()
    .min(1)
    .describe("Human-readable topic for this content action."),
  clusterKeywords: z
    .array(z.string())
    .describe("Keywords/prompts this action targets."),
  sourcePageUrl: z
    .string()
    .nullish()
    .describe(
      "The existing page that prompted this candidate, if any. Null for a brand-new topic.",
    ),
  targetPageUrl: z
    .string()
    .nullish()
    .describe("The page this action produced -- what outcome judging measures."),
  actionType: z
    .string()
    .describe("new-page | companion-post | citation-gap-fix."),
  blogId: z
    .string()
    .min(1)
    .describe("Blog id. The upsert key: call again with the same id to update."),
  blogUrl: z.string().nullish(),
  baselineMetrics: z
    .string()
    .nullish()
    .describe("JSON metrics captured when the action was taken."),
  status: z
    .enum(["drafted", "proposed", "published", "rejected", "judged"])
    .describe("Current lifecycle status."),
  outcome: z
    .enum(["improved", "flat", "worse"])
    .nullish()
    .describe("Set only when status is judged. A rejected draft is not an outcome."),
  outcomeMetrics: z.string().nullish().describe("JSON metrics at judging time."),
  indexedAt: z.string().nullish().describe("When Google confirmed indexing."),
  indexingLink: z
    .string()
    .nullish()
    .describe("inspectionResultLink from inspect_urls, verbatim."),
  judgedAt: z.string().nullish(),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const recordContentActionTool = {
  name: "record_content_action",
  config: {
    title: "Record content action",
    description:
      "Mirror one SEO/GEO cron content action into OpenSEO so the SEO Pipeline dashboard can show it. Upserts by blogId: call it again with the same blogId as the action moves drafted -> proposed -> published -> indexed -> judged. Uses no credits. This is a dashboard mirror only -- the cron's own actions.sqlite stays its source of truth, so a failure here should be logged and skipped, never retried in a way that blocks the run.",
    inputSchema,
    outputSchema: z
      .object({
        blogId: z.string(),
        status: z.string(),
        ...optionalMetaOutputSchema,
      })
      .passthrough(),
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const result = await ContentPipelineService.recordAction({
      projectId: args.projectId,
      job: args.job,
      runDate: args.runDate,
      clusterTopic: args.clusterTopic,
      clusterKeywords: JSON.stringify(args.clusterKeywords),
      sourcePageUrl: args.sourcePageUrl ?? null,
      targetPageUrl: args.targetPageUrl ?? null,
      actionType: args.actionType,
      blogId: args.blogId,
      blogUrl: args.blogUrl ?? null,
      baselineMetrics: args.baselineMetrics ?? null,
      status: args.status,
      outcome: args.outcome ?? null,
      outcomeMetrics: args.outcomeMetrics ?? null,
      indexedAt: args.indexedAt ?? null,
      indexingLink: args.indexingLink ?? null,
      judgedAt: args.judgedAt ?? null,
    });
    return mcpResponse({
      text: `Recorded content action for blog ${result.blogId} (status: ${result.status}).`,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/seo-pipeline`,
      ),
      structuredContent: result,
    });
  }),
};
```

- [ ] **Step 2: Register it**

In `src/server/mcp/server.ts`, add the import alongside the other tool imports:
```typescript
import { recordContentActionTool } from "@/server/mcp/tools/record-content-action";
```
and add `register(recordContentActionTool);` at the end of the register block (after `register(lookupBrandTool);`).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: exit 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/server/mcp/tools/record-content-action.ts src/server/mcp/server.ts
git commit -m "Add record_content_action MCP tool"
```

---

## Task 4: Server function

**Files:**
- Create: `src/serverFunctions/contentPipeline.ts`

**Interfaces:**
- Consumes: `ContentPipelineService.getPipeline` (Task 2).
- Produces: `getContentPipeline` server function — Task 5's page calls it via TanStack Query.

- [ ] **Step 1: Write it**

```typescript
// src/serverFunctions/contentPipeline.ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ContentPipelineService } from "@/server/features/content-pipeline/services/ContentPipelineService";
import { requireProjectContext } from "@/serverFunctions/middleware";

const inputSchema = z.object({ projectId: z.string().min(1) });

/**
 * Everything all four SEO Pipeline tabs need, in one read. Free -- reads only
 * the local mirror table, never Google or DataForSEO.
 */
export const getContentPipeline = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(inputSchema)
  .handler(({ context }) => ContentPipelineService.getPipeline(context.projectId));
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/serverFunctions/contentPipeline.ts
git commit -m "Add getContentPipeline server function"
```

---

## Task 5: The page, its four tabs, and nav registration

**Files:**
- Create: `src/client/features/content-pipeline/SeoPipelinePage.tsx`
- Create: `src/routes/_project/p/$projectId/seo-pipeline.tsx`
- Modify: `src/client/navigation/items.ts`

**Interfaces:**
- Consumes: `getContentPipeline` (Task 4).

- [ ] **Step 1: Write the page**

```tsx
// src/client/features/content-pipeline/SeoPipelinePage.tsx
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CardShell } from "@/client/features/dashboard/cardParts";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getContentPipeline } from "@/serverFunctions/contentPipeline";

const TABS = [
  { tab: "overview", label: "Overview" },
  { tab: "actions", label: "Content Actions" },
  { tab: "coverage", label: "Keyword Coverage" },
  { tab: "outcomes", label: "Outcomes" },
] as const;

export type SeoPipelineTab = (typeof TABS)[number]["tab"];

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "judged"
      ? "badge-success"
      : status === "published"
        ? "badge-info"
        : status === "rejected"
          ? "badge-error"
          : "badge-ghost";
  return <span className={`badge badge-sm ${tone}`}>{status}</span>;
}

function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) return <span className="text-base-content/40">—</span>;
  const tone =
    outcome === "improved"
      ? "badge-success"
      : outcome === "worse"
        ? "badge-error"
        : "badge-ghost";
  return <span className={`badge badge-sm ${tone}`}>{outcome}</span>;
}

function fmtCtr(value: number | null) {
  return value === null ? "—" : `${(value * 100).toFixed(2)}%`;
}

function fmtPosition(value: number | null) {
  return value === null ? "—" : value.toFixed(1);
}

function fmtDelta(value: number | null, opts: { lowerIsBetter?: boolean } = {}) {
  if (value === null) return <span className="text-base-content/40">—</span>;
  const good = opts.lowerIsBetter ? value < 0 : value > 0;
  const cls = value === 0 ? "text-base-content/60" : good ? "text-success" : "text-error";
  const sign = value > 0 ? "+" : "";
  return <span className={cls}>{sign}{value.toFixed(2)}</span>;
}

export function SeoPipelinePage({
  projectId,
  tab,
  onTabChange,
}: {
  projectId: string;
  tab: SeoPipelineTab;
  onTabChange: (tab: SeoPipelineTab) => void;
}) {
  const query = useQuery({
    queryKey: ["contentPipeline", projectId],
    queryFn: () => getContentPipeline({ data: { projectId } }),
  });

  return (
    <div className="px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <div>
          <h1 className="text-2xl font-semibold">SEO Pipeline</h1>
          <p className="text-sm text-base-content/70">
            Keyword → blog → indexed → ranked. Mirrors what the SEO/GEO cron
            actually did; every action still happens by email or in Search
            Console.
          </p>
        </div>

        <div role="tablist" className="tabs tabs-border w-fit">
          {TABS.map(({ tab: value, label }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              className={`tab ${tab === value ? "tab-active" : ""}`}
              onClick={() => onTabChange(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {query.isPending ? (
          <div className="skeleton h-64" aria-busy />
        ) : query.isError ? (
          <div className="alert alert-error">
            {getStandardErrorMessage(query.error)}
          </div>
        ) : !query.data ? null : tab === "overview" ? (
          <OverviewTab data={query.data} />
        ) : tab === "actions" ? (
          <ActionsTab data={query.data} />
        ) : tab === "coverage" ? (
          <CoverageTab data={query.data} projectId={projectId} />
        ) : (
          <OutcomesTab data={query.data} />
        )}
      </div>
    </div>
  );
}

type PipelineData = Awaited<ReturnType<typeof getContentPipeline>>;

function OverviewTab({ data }: { data: PipelineData }) {
  const stages = [
    { label: "Drafted", value: data.funnel.drafted },
    { label: "Published", value: data.funnel.published },
    { label: "Indexed", value: data.funnel.indexed },
    { label: "Judged", value: data.funnel.judged },
  ];

  return (
    <div className="flex flex-col gap-5">
      <CardShell title="Pipeline" stamp="All time, with the last 7 days">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stages.map((stage) => (
            <div key={stage.label} className="rounded-lg border border-base-300 p-3">
              <p className="text-xs uppercase tracking-wide text-base-content/60">
                {stage.label}
              </p>
              <p className="text-2xl font-semibold tabular-nums">
                {stage.value.total}
              </p>
              <p className="text-xs text-base-content/60">
                +{stage.value.thisWeek} this week
              </p>
            </div>
          ))}
        </div>
      </CardShell>

      <CardShell title="Needs you" stamp="Waiting on a human">
        {data.attention.pendingApproval.length === 0 &&
        data.attention.awaitingIndexing.length === 0 ? (
          <p className="text-sm text-base-content/60">
            Nothing waiting. Drafts awaiting approval and published pages Google
            hasn&rsquo;t indexed yet show up here.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {data.attention.pendingApproval.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium">
                  Awaiting your approval ({data.attention.pendingApproval.length})
                  <span className="ml-2 font-normal text-base-content/60">
                    — approve or reject from the review email
                  </span>
                </p>
                <ul className="space-y-1 text-sm">
                  {data.attention.pendingApproval.map((item) => (
                    <li key={item.blogId} className="text-base-content/80">
                      {item.clusterTopic}{" "}
                      <span className="text-base-content/50">({item.runDate})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {data.attention.awaitingIndexing.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium">
                  Published, not yet indexed ({data.attention.awaitingIndexing.length})
                </p>
                <ul className="space-y-1 text-sm">
                  {data.attention.awaitingIndexing.map((item) => (
                    <li key={item.blogId} className="flex flex-wrap items-center gap-2">
                      <span className="text-base-content/80">{item.clusterTopic}</span>
                      {item.indexingLink && (
                        <a
                          href={item.indexingLink}
                          target="_blank"
                          rel="noreferrer"
                          className="link link-primary text-xs"
                        >
                          Request indexing in Search Console →
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardShell>
    </div>
  );
}

function ActionsTab({ data }: { data: PipelineData }) {
  if (data.actions.length === 0) {
    return (
      <CardShell title="Content actions" stamp="Every action the cron took">
        <p className="text-sm text-base-content/60">
          No content actions recorded yet.
        </p>
      </CardShell>
    );
  }

  return (
    <CardShell title="Content actions" stamp="Every action the cron took">
      <div className="overflow-x-auto">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Topic</th>
              <th>Job</th>
              <th>Type</th>
              <th>Status</th>
              <th>Indexed</th>
              <th>Outcome</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {data.actions.map((action) => (
              <tr key={action.blogId}>
                <td>
                  {action.targetPageUrl ? (
                    <a
                      href={action.targetPageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="link"
                    >
                      {action.clusterTopic}
                    </a>
                  ) : (
                    action.clusterTopic
                  )}
                  <div className="text-xs text-base-content/50">
                    {action.keywords.join(", ")}
                  </div>
                </td>
                <td className="uppercase text-xs">{action.job}</td>
                <td className="text-xs">{action.actionType}</td>
                <td><StatusBadge status={action.status} /></td>
                <td className="text-xs">
                  {action.indexedAt ? (
                    <span className="text-success">Yes</span>
                  ) : action.indexingLink ? (
                    <a
                      href={action.indexingLink}
                      target="_blank"
                      rel="noreferrer"
                      className="link link-primary"
                    >
                      Request
                    </a>
                  ) : (
                    <span className="text-base-content/40">—</span>
                  )}
                </td>
                <td><OutcomeBadge outcome={action.outcome} /></td>
                <td className="text-xs text-base-content/60">{action.runDate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CardShell>
  );
}

function CoverageTab({
  data,
  projectId,
}: {
  data: PipelineData;
  projectId: string;
}) {
  return (
    <CardShell
      title="Keyword coverage"
      stamp="Which tracked keywords have been acted on"
      action={
        <Link
          to="/p/$projectId/rank-tracking"
          params={{ projectId }}
          className="link link-primary text-sm"
        >
          Positions in Rank Tracking →
        </Link>
      }
    >
      {data.keywordCoverage.actedOn.length === 0 ? (
        <p className="text-sm text-base-content/60">
          No keywords acted on yet. Positions and volume live in Rank Tracking.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Keyword</th>
                <th>Covered by</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.keywordCoverage.actedOn.map((item) => (
                <tr key={`${item.blogId}-${item.keyword}`}>
                  <td className="font-mono text-xs">{item.keyword}</td>
                  <td className="text-sm">
                    {item.targetPageUrl ? (
                      <a
                        href={item.targetPageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="link"
                      >
                        {item.clusterTopic}
                      </a>
                    ) : (
                      item.clusterTopic
                    )}
                  </td>
                  <td><StatusBadge status={item.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CardShell>
  );
}

function OutcomesTab({ data }: { data: PipelineData }) {
  const { rows, improved, flat, worse } = data.outcomes;

  return (
    <CardShell
      title="Outcomes"
      stamp="Judged 14 days after publish — rejected drafts are not counted"
    >
      {rows.length === 0 ? (
        <p className="text-sm text-base-content/60">
          Nothing judged yet. Each published page is measured against its
          baseline 14 days after it goes live.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex gap-3 text-sm">
            <span className="text-success">{improved} improved</span>
            <span className="text-base-content/60">{flat} flat</span>
            <span className="text-error">{worse} worse</span>
          </div>
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Topic</th>
                  <th>Verdict</th>
                  <th>Position</th>
                  <th>Δ</th>
                  <th>CTR</th>
                  <th>Δ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.blogId}>
                    <td>
                      {row.targetPageUrl ? (
                        <a
                          href={row.targetPageUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="link"
                        >
                          {row.clusterTopic}
                        </a>
                      ) : (
                        row.clusterTopic
                      )}
                    </td>
                    <td><OutcomeBadge outcome={row.outcome} /></td>
                    <td className="tabular-nums text-xs">
                      {fmtPosition(row.baselinePosition)} →{" "}
                      {fmtPosition(row.outcomePosition)}
                    </td>
                    <td className="tabular-nums text-xs">
                      {fmtDelta(row.positionDelta, { lowerIsBetter: true })}
                    </td>
                    <td className="tabular-nums text-xs">
                      {fmtCtr(row.baselineCtr)} → {fmtCtr(row.outcomeCtr)}
                    </td>
                    <td className="tabular-nums text-xs">
                      {fmtDelta(row.ctrDelta === null ? null : row.ctrDelta * 100)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </CardShell>
  );
}
```

- [ ] **Step 2: Write the route (search-param-driven tabs)**

```tsx
// src/routes/_project/p/$projectId/seo-pipeline.tsx
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  SeoPipelinePage,
  type SeoPipelineTab,
} from "@/client/features/content-pipeline/SeoPipelinePage";

const searchSchema = z.object({
  tab: z
    .enum(["overview", "actions", "coverage", "outcomes"])
    .catch("overview"),
});

export const Route = createFileRoute("/_project/p/$projectId/seo-pipeline")({
  validateSearch: searchSchema,
  component: SeoPipelineRoute,
});

function SeoPipelineRoute() {
  const { projectId } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <SeoPipelinePage
      projectId={projectId}
      tab={tab}
      onTabChange={(next: SeoPipelineTab) =>
        navigate({ search: { tab: next } })
      }
    />
  );
}
```

- [ ] **Step 3: Register the nav item**

In `src/client/navigation/items.ts`:
1. Add `Workflow` to the `lucide-react` import list (alphabetical, after `TrendingUp`).
2. Add to `projectNavItems`, after the `search-performance` entry:
```typescript
  {
    to: "/p/$projectId/seo-pipeline" as const,
    label: "SEO Pipeline",
    icon: Workflow,
  },
```
3. In `getProjectNavGroups`'s "My Site" group, add `byPath("/p/$projectId/seo-pipeline"),` after the `rank-tracking` line.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: exit 0. (The route tree is generated by the TanStack Router plugin — if the new route isn't recognized, run `npx vite build --mode selfhost` once to regenerate `routeTree.gen.ts`, then re-run the typecheck.)

- [ ] **Step 5: Commit**

```bash
git add src/client/features/content-pipeline/ 'src/routes/_project/p/$projectId/seo-pipeline.tsx' src/client/navigation/items.ts src/routeTree.gen.ts
git commit -m "Add SEO Pipeline page with four tabs and nav entry"
```

---

## Task 6: Wire the cron prompts to the new tool

**Files:**
- Modify: `seo-geo-cron/prompts/_common.md`
- Modify: `seo-geo-cron/prompts/seo.md`

**Interfaces:**
- Consumes: the `record_content_action` MCP tool (Task 3).

- [ ] **Step 1: Add the mirror instruction to `_common.md`**

In `_common.md`'s "Outcome tracking (`actions.sqlite`)" section, immediately after the migration code block (the `for column in ('source_page_url', 'indexed_at')` block), insert:

```markdown
**Mirror every write to the dashboard.** Immediately after each successful
local write below, call the `record_content_action` MCP tool with the same
values (it upserts by `blog_id`, so calling it repeatedly for the same blog as
it moves through the pipeline is exactly the intended usage). This populates
OpenSEO's **SEO Pipeline** page so the dashboard shows what the cron actually
did. It uses no credits.

This mirror is **best-effort**: if the call fails, note it in the research log
and carry on. `actions.sqlite` is the source of truth for every decision this
job makes; a missed mirror write is a stale dashboard row, never a wrong
decision. Never retry in a way that blocks the run, and never skip or roll back
a local write because the mirror failed.

While you are in the indexing check below, you already fetch each row's current
blog status via `GET /blogs/{blog_id}` — pass that status through to
`record_content_action` (`published`, `rejected` when it has gone back to
`draft`, otherwise the row's existing status). That daily read is what keeps the
dashboard's approval state fresh without waiting for Step 0's 14-day window.
```

- [ ] **Step 2: Add the mirror call to `seo.md`'s publishing loop**

In `seo.md`, in the numbered publishing loop, the existing step 3 (the `add_rank_tracking_keywords` sync step) becomes step 4, and this becomes the new step 3:

```markdown
3. Mirror this row to the dashboard: call `record_content_action` with
   `projectId`, `job: "seo"`, `runDate`, `clusterTopic`, `clusterKeywords`,
   `sourcePageUrl`, `targetPageUrl` (the companion's own URL), `actionType`,
   `blogId`, `blogUrl` (same as `targetPageUrl`), `baselineMetrics`, and
   `status: "drafted"`. Free, no credits. If it fails, note it in the research
   log and continue — see `_common.md`'s mirror note.
```

Then, in the "**On success**, flip exactly the rows you just inserted" block, append after the Python snippet:

```markdown
Then mirror the same flip: call `record_content_action` once per row you just
flipped, with the same `blogId` and `status: "proposed"`.
```

- [ ] **Step 3: Verify the numbering is still coherent**

Run: `grep -n "^[0-9]\." seo-geo-cron/prompts/seo.md | head -20`
Expected: the publishing loop's steps read 1, 2, 3, 4 in order with no duplicates or gaps.

- [ ] **Step 4: Commit**

```bash
git add seo-geo-cron/prompts/_common.md seo-geo-cron/prompts/seo.md
git commit -m "Mirror cron content actions into the SEO Pipeline dashboard"
```

---

## Task 7: Migrate, deploy, verify end-to-end

**Files:** none — operational.

- [ ] **Step 1: Apply the D1 migration to the live self-hosted instance**

Run: `npx wrangler d1 migrations apply DB --remote`
Expected: the new `klaussa_content_actions` migration applies cleanly. (Check the command's own output for the applied migration name; if `DB` is not the right binding name, read it from `alchemy.run.ts` or `wrangler.jsonc` rather than guessing.)

- [ ] **Step 2: Deploy**

Run: `COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm run deploy:selfhost --yes`
Expected: deploy succeeds, URL unchanged (`https://open-seo-selfhost.navigoinfo-id.workers.dev`).

- [ ] **Step 3: Backfill the 6 real rows already in `actions.sqlite`**

The local DB already holds 6 real rows from this session's pilots. Backfill them through the new tool so the dashboard isn't empty on first view — this also serves as the end-to-end verification that the tool, service, repository, and schema all work against production.

Read each row out of `seo-geo-cron/data/actions.sqlite` and call `record_content_action` once per row, mapping columns directly. Use the real current blog status for each (4 are `published`, 2 are `need_approval` → `proposed`).

- [ ] **Step 4: Verify in the dashboard**

Open `https://open-seo-selfhost.navigoinfo-id.workers.dev/p/60bfa4e0-fc18-452a-845b-70c99f82644e/seo-pipeline` and confirm:
- "SEO Pipeline" appears in the left nav under My Site.
- Overview shows a funnel with 6 drafted / 4 published / 0 indexed / 0 judged, and lists 2 pending approvals plus 4 awaiting indexing.
- Content Actions lists all 6 rows.
- Keyword Coverage lists the keywords from those rows.
- Outcomes is empty with its "nothing judged yet" message (correct — nothing is 14 days old).
- Switching tabs changes the URL's `?tab=` param and survives a page refresh.
