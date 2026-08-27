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
  .handler(({ context }) =>
    ContentPipelineService.getPipeline(context.projectId),
  );
