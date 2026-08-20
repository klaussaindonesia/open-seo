import { beforeEach, describe, expect, it, vi } from "vitest";
import { lookupBrandTool } from "./lookup-brand";
import { makeToolContext } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  getBrandLookup: vi.fn(),
  getProjectForOrganization: vi.fn(),
}));

vi.mock("@/server/features/ai-search/services/brandLookup", () => ({
  getBrandLookup: mocks.getBrandLookup,
}));

vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));

const toolContext = makeToolContext();

describe("lookup_brand MCP tool", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockResolvedValue({ id: "project_1" });
  });

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
      {
        userId: "user_123",
        userEmail: "alice@example.com",
        organizationId: "org_123",
        projectId: "project_1",
      },
    );
    expect(result.structuredContent?.result).toMatchObject({
      resolvedTarget: "klaussa.com",
      hasData: true,
    });
  });
});
