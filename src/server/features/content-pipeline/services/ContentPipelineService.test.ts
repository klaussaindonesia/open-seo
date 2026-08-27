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
      action({
        blogId: "b1",
        status: "judged",
        indexedAt: "2026-08-20",
        outcome: "improved",
      }),
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
      action({
        blogId: "b1",
        status: "judged",
        outcome: "flat",
        baselineMetrics: null,
        outcomeMetrics: "not json",
      }),
    ]);

    const result = await ContentPipelineService.getPipeline("p1");

    expect(result.outcomes.rows[0].positionDelta).toBeNull();
    expect(result.outcomes.rows[0].ctrDelta).toBeNull();
  });
});

describe("getPipeline keyword coverage", () => {
  it("marks a keyword acted-on when any row's clusterKeywords contains it", async () => {
    mocks.listByProject.mockResolvedValue([
      action({
        blogId: "b1",
        clusterKeywords: JSON.stringify(["apa itu pks", "pks adalah"]),
      }),
    ]);

    const result = await ContentPipelineService.getPipeline("p1");

    expect(result.keywordCoverage.actedOn).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyword: "apa itu pks",
          clusterTopic: "MoU vs PKS",
        }),
      ]),
    );
  });
});
