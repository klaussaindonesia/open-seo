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
function stage(
  rows: ContentAction[],
  nowMs: number,
  recencyKey: keyof ContentAction,
) {
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
      positionDelta: delta(
        baseline?.position ?? null,
        outcome?.position ?? null,
      ),
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
