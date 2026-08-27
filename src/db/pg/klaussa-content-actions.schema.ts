import { sql } from "drizzle-orm";
import { index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { projects } from "./app.schema";

// See src/db/pg/app.schema.ts for why timestamps are ISO-8601 UTC text.
const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

// Postgres twin of src/db/klaussa-content-actions.schema.ts. Kept structurally
// identical -- schema-parity.test.ts fails the moment these drift.
export const klaussaContentActions = pgTable(
  "klaussa_content_actions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    job: text("job").notNull(),
    runDate: text("run_date").notNull(),
    clusterTopic: text("cluster_topic").notNull(),
    clusterKeywords: text("cluster_keywords").notNull(),
    sourcePageUrl: text("source_page_url"),
    targetPageUrl: text("target_page_url"),
    actionType: text("action_type").notNull(),
    blogId: text("blog_id").notNull(),
    blogUrl: text("blog_url"),
    baselineMetrics: text("baseline_metrics"),
    status: text("status").notNull(),
    outcome: text("outcome"),
    outcomeMetrics: text("outcome_metrics"),
    indexedAt: text("indexed_at"),
    indexingLink: text("indexing_link"),
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
    judgedAt: text("judged_at"),
  },
  (table) => [
    uniqueIndex("klaussa_content_actions_blog_idx").on(table.blogId),
    index("klaussa_content_actions_project_status_idx").on(
      table.projectId,
      table.status,
    ),
  ],
);
