import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  SeoPipelinePage,
  type SeoPipelineTab,
} from "@/client/features/content-pipeline/SeoPipelinePage";

const searchSchema = z.object({
  tab: z.enum(["overview", "actions", "coverage", "outcomes"]).catch("overview"),
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
      onTabChange={(next: SeoPipelineTab) => navigate({ search: { tab: next } })}
    />
  );
}
