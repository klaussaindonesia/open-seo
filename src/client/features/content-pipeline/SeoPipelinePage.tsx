import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CardShell } from "@/client/features/dashboard/cardParts";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getContentPipeline } from "@/serverFunctions/contentPipeline";

const TABS = [
  { tab: "overview", label: "Overview" },
  { tab: "actions", label: "Content Actions" },
  { tab: "coverage", label: "Keyword Coverage" },
  { tab: "outcomes", label: "Outcomes" },
] as const;

export type SeoPipelineTab = (typeof TABS)[number]["tab"];

type PipelineData = Awaited<ReturnType<typeof getContentPipeline>>;

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "judged"
      ? "badge-success"
      : status === "published"
        ? "badge-info"
        : status === "rejected"
          ? "badge-error"
          : "badge-ghost";
  return <span className={`badge badge-sm ${tone}`}>{status}</span>;
}

function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) return <span className="text-base-content/40">—</span>;
  const tone =
    outcome === "improved"
      ? "badge-success"
      : outcome === "worse"
        ? "badge-error"
        : "badge-ghost";
  return <span className={`badge badge-sm ${tone}`}>{outcome}</span>;
}

function fmtCtr(value: number | null) {
  return value === null ? "—" : `${(value * 100).toFixed(2)}%`;
}

function fmtPosition(value: number | null) {
  return value === null ? "—" : value.toFixed(1);
}

function DeltaCell({
  value,
  lowerIsBetter = false,
}: {
  value: number | null;
  lowerIsBetter?: boolean;
}) {
  if (value === null) return <span className="text-base-content/40">—</span>;
  const good = lowerIsBetter ? value < 0 : value > 0;
  const cls =
    value === 0 ? "text-base-content/60" : good ? "text-success" : "text-error";
  const sign = value > 0 ? "+" : "";
  return (
    <span className={cls}>
      {sign}
      {value.toFixed(2)}
    </span>
  );
}

export function SeoPipelinePage({
  projectId,
  tab,
  onTabChange,
}: {
  projectId: string;
  tab: SeoPipelineTab;
  onTabChange: (tab: SeoPipelineTab) => void;
}) {
  const query = useQuery({
    queryKey: ["contentPipeline", projectId],
    queryFn: () => getContentPipeline({ data: { projectId } }),
  });

  return (
    <div className="px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <div>
          <h1 className="text-2xl font-semibold">SEO Pipeline</h1>
          <p className="text-sm text-base-content/70">
            Keyword → blog → indexed → ranked. Mirrors what the SEO/GEO cron
            actually did; every action still happens by email or in Search
            Console.
          </p>
        </div>

        <div role="tablist" className="tabs tabs-border w-fit">
          {TABS.map(({ tab: value, label }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              className={`tab ${tab === value ? "tab-active" : ""}`}
              onClick={() => onTabChange(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {query.isPending ? (
          <div className="skeleton h-64" aria-busy />
        ) : query.isError ? (
          <div className="alert alert-error">
            {getStandardErrorMessage(query.error)}
          </div>
        ) : !query.data ? null : tab === "overview" ? (
          <OverviewTab data={query.data} />
        ) : tab === "actions" ? (
          <ActionsTab data={query.data} />
        ) : tab === "coverage" ? (
          <CoverageTab data={query.data} projectId={projectId} />
        ) : (
          <OutcomesTab data={query.data} />
        )}
      </div>
    </div>
  );
}

function OverviewTab({ data }: { data: PipelineData }) {
  const stages = [
    { label: "Drafted", value: data.funnel.drafted },
    { label: "Published", value: data.funnel.published },
    { label: "Indexed", value: data.funnel.indexed },
    { label: "Judged", value: data.funnel.judged },
  ];

  return (
    <div className="flex flex-col gap-5">
      <CardShell title="Pipeline" stamp="All time, with the last 7 days">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stages.map((stage) => (
            <div
              key={stage.label}
              className="rounded-lg border border-base-300 p-3"
            >
              <p className="text-xs uppercase tracking-wide text-base-content/60">
                {stage.label}
              </p>
              <p className="text-2xl font-semibold tabular-nums">
                {stage.value.total}
              </p>
              <p className="text-xs text-base-content/60">
                +{stage.value.thisWeek} this week
              </p>
            </div>
          ))}
        </div>
      </CardShell>

      <CardShell title="Needs you" stamp="Waiting on a human">
        {data.attention.pendingApproval.length === 0 &&
        data.attention.awaitingIndexing.length === 0 ? (
          <p className="text-sm text-base-content/60">
            Nothing waiting. Drafts awaiting approval and published pages Google
            hasn&rsquo;t indexed yet show up here.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {data.attention.pendingApproval.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium">
                  Awaiting your approval ({data.attention.pendingApproval.length}
                  )
                  <span className="ml-2 font-normal text-base-content/60">
                    — approve or reject from the review email
                  </span>
                </p>
                <ul className="space-y-1 text-sm">
                  {data.attention.pendingApproval.map((item) => (
                    <li key={item.blogId} className="text-base-content/80">
                      {item.clusterTopic}{" "}
                      <span className="text-base-content/50">
                        ({item.runDate})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {data.attention.awaitingIndexing.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium">
                  Published, not yet indexed (
                  {data.attention.awaitingIndexing.length})
                </p>
                <ul className="space-y-1 text-sm">
                  {data.attention.awaitingIndexing.map((item) => (
                    <li
                      key={item.blogId}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <span className="text-base-content/80">
                        {item.clusterTopic}
                      </span>
                      {item.indexingLink && (
                        <a
                          href={item.indexingLink}
                          target="_blank"
                          rel="noreferrer"
                          className="link link-primary text-xs"
                        >
                          Request indexing in Search Console →
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardShell>
    </div>
  );
}

function ActionsTab({ data }: { data: PipelineData }) {
  if (data.actions.length === 0) {
    return (
      <CardShell title="Content actions" stamp="Every action the cron took">
        <p className="text-sm text-base-content/60">
          No content actions recorded yet.
        </p>
      </CardShell>
    );
  }

  return (
    <CardShell title="Content actions" stamp="Every action the cron took">
      <div className="overflow-x-auto">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Topic</th>
              <th>Job</th>
              <th>Type</th>
              <th>Status</th>
              <th>Indexed</th>
              <th>Outcome</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {data.actions.map((action) => (
              <tr key={action.blogId}>
                <td>
                  {action.targetPageUrl ? (
                    <a
                      href={action.targetPageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="link"
                    >
                      {action.clusterTopic}
                    </a>
                  ) : (
                    action.clusterTopic
                  )}
                  <div className="text-xs text-base-content/50">
                    {action.keywords.join(", ")}
                  </div>
                </td>
                <td className="text-xs uppercase">{action.job}</td>
                <td className="text-xs">{action.actionType}</td>
                <td>
                  <StatusBadge status={action.status} />
                </td>
                <td className="text-xs">
                  {action.indexedAt ? (
                    <span className="text-success">Yes</span>
                  ) : action.indexingLink ? (
                    <a
                      href={action.indexingLink}
                      target="_blank"
                      rel="noreferrer"
                      className="link link-primary"
                    >
                      Request
                    </a>
                  ) : (
                    <span className="text-base-content/40">—</span>
                  )}
                </td>
                <td>
                  <OutcomeBadge outcome={action.outcome} />
                </td>
                <td className="text-xs text-base-content/60">
                  {action.runDate}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CardShell>
  );
}

function CoverageTab({
  data,
  projectId,
}: {
  data: PipelineData;
  projectId: string;
}) {
  return (
    <CardShell
      title="Keyword coverage"
      stamp="Which tracked keywords have been acted on"
      action={
        <Link
          to="/p/$projectId/rank-tracking"
          params={{ projectId }}
          className="link link-primary text-sm"
        >
          Positions in Rank Tracking →
        </Link>
      }
    >
      {data.keywordCoverage.actedOn.length === 0 ? (
        <p className="text-sm text-base-content/60">
          No keywords acted on yet. Positions and volume live in Rank Tracking.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Keyword</th>
                <th>Covered by</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.keywordCoverage.actedOn.map((item) => (
                <tr key={`${item.blogId}-${item.keyword}`}>
                  <td className="font-mono text-xs">{item.keyword}</td>
                  <td className="text-sm">
                    {item.targetPageUrl ? (
                      <a
                        href={item.targetPageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="link"
                      >
                        {item.clusterTopic}
                      </a>
                    ) : (
                      item.clusterTopic
                    )}
                  </td>
                  <td>
                    <StatusBadge status={item.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CardShell>
  );
}

function OutcomesTab({ data }: { data: PipelineData }) {
  const { rows, improved, flat, worse } = data.outcomes;

  return (
    <CardShell
      title="Outcomes"
      stamp="Judged 14 days after publish — rejected drafts are not counted"
    >
      {rows.length === 0 ? (
        <p className="text-sm text-base-content/60">
          Nothing judged yet. Each published page is measured against its
          baseline 14 days after it goes live.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex gap-3 text-sm">
            <span className="text-success">{improved} improved</span>
            <span className="text-base-content/60">{flat} flat</span>
            <span className="text-error">{worse} worse</span>
          </div>
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Topic</th>
                  <th>Verdict</th>
                  <th>Position</th>
                  <th>Δ</th>
                  <th>CTR</th>
                  <th>Δ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.blogId}>
                    <td>
                      {row.targetPageUrl ? (
                        <a
                          href={row.targetPageUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="link"
                        >
                          {row.clusterTopic}
                        </a>
                      ) : (
                        row.clusterTopic
                      )}
                    </td>
                    <td>
                      <OutcomeBadge outcome={row.outcome} />
                    </td>
                    <td className="text-xs tabular-nums">
                      {fmtPosition(row.baselinePosition)} →{" "}
                      {fmtPosition(row.outcomePosition)}
                    </td>
                    <td className="text-xs tabular-nums">
                      <DeltaCell value={row.positionDelta} lowerIsBetter />
                    </td>
                    <td className="text-xs tabular-nums">
                      {fmtCtr(row.baselineCtr)} → {fmtCtr(row.outcomeCtr)}
                    </td>
                    <td className="text-xs tabular-nums">
                      <DeltaCell
                        value={row.ctrDelta === null ? null : row.ctrDelta * 100}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </CardShell>
  );
}
