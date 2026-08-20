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
