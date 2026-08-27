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
    .describe(
      "The page this action produced -- what outcome judging measures.",
    ),
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
    .describe(
      "Set only when status is judged. A rejected draft is not an outcome.",
    ),
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
