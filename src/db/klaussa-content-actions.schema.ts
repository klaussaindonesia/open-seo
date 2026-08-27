import { sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { projects } from "./app.schema";

// Mirror of the SEO/GEO cron's local `seo-geo-cron/data/actions.sqlite`, which
// lives on the machine running the cron and is invisible to this app. The cron
// dual-writes each row here via the `record_content_action` MCP tool so the
// dashboard can show the pipeline. `actions.sqlite` stays the cron's own source
// of truth; this table is a read-only mirror for reporting.
export const klaussaContentActions = sqliteTable(
  "klaussa_content_actions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    job: text("job").notNull(),
    runDate: text("run_date").notNull(),
    clusterTopic: text("cluster_topic").notNull(),
    // JSON array as text: matches actions.sqlite's own convention and keeps the
    // two dialects textually identical for the parity test.
    clusterKeywords: text("cluster_keywords").notNull(),
    // The existing page that prompted this candidate (exclusion key upstream).
    sourcePageUrl: text("source_page_url"),
    // The page the action actually produced -- what outcome judging measures.
    targetPageUrl: text("target_page_url"),
    actionType: text("action_type").notNull(),
    blogId: text("blog_id").notNull(),
    blogUrl: text("blog_url"),
    baselineMetrics: text("baseline_metrics"),
    status: text("status").notNull(),
    outcome: text("outcome"),
    outcomeMetrics: text("outcome_metrics"),
    indexedAt: text("indexed_at"),
    // Verbatim inspectionResultLink from inspect_urls: a real pre-filled Search
    // Console URL. Stored so the dashboard never re-calls Google to render it.
    indexingLink: text("indexing_link"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    judgedAt: text("judged_at"),
  },
  (table) => [
    // The upsert target: one row per blog, updated in place as it moves
    // drafted -> proposed -> published -> indexed -> judged.
    uniqueIndex("klaussa_content_actions_blog_idx").on(table.blogId),
    index("klaussa_content_actions_project_status_idx").on(
      table.projectId,
      table.status,
    ),
  ],
);
