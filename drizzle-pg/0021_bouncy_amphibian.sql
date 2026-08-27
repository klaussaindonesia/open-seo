CREATE TABLE "klaussa_content_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"job" text NOT NULL,
	"run_date" text NOT NULL,
	"cluster_topic" text NOT NULL,
	"cluster_keywords" text NOT NULL,
	"source_page_url" text,
	"target_page_url" text,
	"action_type" text NOT NULL,
	"blog_id" text NOT NULL,
	"blog_url" text,
	"baseline_metrics" text,
	"status" text NOT NULL,
	"outcome" text,
	"outcome_metrics" text,
	"indexed_at" text,
	"indexing_link" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"judged_at" text
);
--> statement-breakpoint
ALTER TABLE "klaussa_content_actions" ADD CONSTRAINT "klaussa_content_actions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "klaussa_content_actions_blog_idx" ON "klaussa_content_actions" USING btree ("blog_id");--> statement-breakpoint
CREATE INDEX "klaussa_content_actions_project_status_idx" ON "klaussa_content_actions" USING btree ("project_id","status");