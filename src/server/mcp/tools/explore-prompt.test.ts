import { beforeEach, describe, expect, it, vi } from "vitest";
import { explorePromptTool } from "./explore-prompt";
import { makeToolContext } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  explorePrompt: vi.fn(),
  getProjectForOrganization: vi.fn(),
}));

vi.mock("@/server/features/ai-search/services/promptExplorer", () => ({
  explorePrompt: mocks.explorePrompt,
}));

vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));

const toolContext = makeToolContext();

describe("explore_prompt MCP tool", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockResolvedValue({ id: "project_1" });
  });

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
      {
        userId: "user_123",
        userEmail: "alice@example.com",
        organizationId: "org_123",
        projectId: "project_1",
      },
    );
    expect(result.structuredContent?.result).toMatchObject({
      prompt: "best legal AI Indonesia",
      results: [
        expect.objectContaining({ model: "claude", brandMentioned: true }),
      ],
    });
  });
});
