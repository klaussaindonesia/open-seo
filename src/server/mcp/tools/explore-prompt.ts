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
    .describe(
      "Allow the model to browse the web when answering (default true).",
    ),
  webSearchCountryCode: webSearchCountryCodeSchema
    .optional()
    .describe(
      "ISO-2 country code for the web-search component of the answer.",
    ),
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
