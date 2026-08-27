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
