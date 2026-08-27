# SEO/GEO Velocity & Outcome Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise SEO from 1 draft/week to up to 5/day and GEO from 1/week
to up to 2/week, without reintroducing keyword cannibalization or
unbounded content volume — via a cluster-then-cap opportunity-discovery
step, a shared outcome-tracking table that checks whether past actions
worked before proposing new ones, and one digest email per run instead of
one email per item.

**Architecture:** No new application code in this repo (`autoseo`) — the
algorithm lives entirely as prose instructions in
`seo-geo-cron/prompts/{_common,seo,geo}.md`, executed by the same headless
`claude -p` agent that already runs these jobs. The only real code changes
are in the separate `blog-review-email` Cloudflare Worker repo, which
gains digest support (one email, N independently-approvable items) while
its approve/reject execution path stays untouched.

**Tech Stack:** Markdown prompt files (autoseo), TypeScript Cloudflare
Worker + Vitest (blog-review-email), SQLite (`actions.sqlite`, created at
runtime by the cron jobs themselves).

**Spec:** `docs/superpowers/specs/2026-08-27-seo-geo-velocity-and-outcome-tracking-design.md`

## Global Constraints

- Content-draft cap: SEO **5**/run, GEO **2**/run. Escalation cap stays
  **1**/run for both, unchanged.
- `actions.sqlite` judging window: **14 days**, fixed, same for every
  action type (spec §4 — deliberately not type-dependent).
- One digest email per run, regardless of item count (spec §5). SEO's and
  GEO's digests stay **separate** emails — never merged.
- No padding: fewer genuine opportunities than the cap → do less, never
  invent a lower-value action to hit the number.
- `git` remote for this repo is `klaussa-fork`
  (`github.com/klaussaindonesia/open-seo.git`), branch
  `worktree-seo-geo-cron-spec` — **not** `origin` (read-only for this
  account). Every commit in this repo pushes there.
- `blog-review-email` is a separate live repo at
  `/home/ez/Code/navigo/klaussa-lab/blog-review-email`, already authorized
  for direct commits to `main` from earlier work this session.
- Prompt-file changes (`_common.md`/`seo.md`/`geo.md`) are verified by a
  real pilot run (`seo-geo-cron/pilot-run.sh <job>`, from this worktree's
  `seo-geo-cron/` directory), not a unit test — they are natural-language
  instructions to an LLM agent, not code.

---

## Task 1: `blog-review-email` — digest email builder

**Files:**
- Create: `blog-review-email/vitest.config.ts`
- Create: `blog-review-email/src/approval_email.test.ts`
- Modify: `blog-review-email/src/approval_email.ts` (replace
  `buildApprovalEmail` with `buildDigestEmail`)

**Interfaces:**
- Consumes: `Env` type from `./router` (existing — `HMAC_SECRET`,
  `PUBLIC_BASE_URL`), `Proposal` type from `./store` (existing —
  `{id, blogId, title, summary, adminUrl, resolved, createdAt}`),
  `signUrl(path, expUnix, secret)` from `./hmac` (existing, unchanged),
  `tiptapToHtml(content)`/`tiptapToPlaintext(content)` from
  `./tiptap_render` (existing, unchanged).
- Produces: `export type DigestItem = { proposal: Proposal; approveNonce:
  string; rejectNonce: string; content: unknown }` and `export async
  function buildDigestEmail(env: Env, items: DigestItem[]): Promise<{
  subject: string; html: string; plaintext: string }>` — Task 2 calls
  this.

This worker currently has `vitest`/`@cloudflare/vitest-pool-workers` as
devDependencies (`package.json`'s `test` script is already `vitest run`)
but no config file and zero test files. `buildDigestEmail` only touches
plain data and `crypto.subtle` (via `signUrl`) — no KV/email bindings —
so a minimal Node-environment vitest config is sufficient; the Workers
pool isn't needed for this pure function.

- [ ] **Step 1: Create the vitest config**

```typescript
// blog-review-email/vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {},
});
```

- [ ] **Step 2: Write the failing tests**

```typescript
// blog-review-email/src/approval_email.test.ts
import { describe, it, expect } from "vitest";
import { buildDigestEmail, type DigestItem } from "./approval_email";
import type { Env } from "./router";
import type { Proposal } from "./store";

function fakeEnv(): Env {
  return {
    HMAC_SECRET: "test-secret",
    BACKEND_URL: "https://api.example.test",
    APPROVER_EMAIL: "approver@example.test",
    APPROVER_PASSWORD: "x",
    FROM_ADDR: "noreply@example.test",
    FROM_NAME: "Test",
    REPLY_TO: "noreply@example.test",
    PUBLIC_BASE_URL: "https://review.example.test",
    PROPOSAL_KV: {} as KVNamespace,
    EMAIL: {} as SendEmail,
  };
}

function fakeProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: "prop-1",
    blogId: "blog-1",
    title: "Test Title",
    summary: "Test summary",
    adminUrl: "https://klaussa.com/blogs/dashboard",
    resolved: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function fakeItem(n: number): DigestItem {
  return {
    proposal: fakeProposal({
      id: `prop-${n}`,
      blogId: `blog-${n}`,
      title: `Title ${n}`,
      summary: `Summary ${n}`,
    }),
    approveNonce: `approve-nonce-${n}`,
    rejectNonce: `reject-nonce-${n}`,
    content: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: `Body ${n}` }] }],
    },
  };
}

describe("buildDigestEmail", () => {
  it("renders one independent approve/reject link pair per item", async () => {
    const items = [fakeItem(1), fakeItem(2), fakeItem(3)];
    const mail = await buildDigestEmail(fakeEnv(), items);

    const approveLinks = [...mail.html.matchAll(/\/a\/approve-nonce-\d+/g)].map((m) => m[0]);
    const rejectLinks = [...mail.html.matchAll(/\/r\/reject-nonce-\d+/g)].map((m) => m[0]);
    expect(new Set(approveLinks).size).toBe(3);
    expect(new Set(rejectLinks).size).toBe(3);
  });

  it("includes every item's title and rendered content", async () => {
    const items = [fakeItem(1), fakeItem(2)];
    const mail = await buildDigestEmail(fakeEnv(), items);
    expect(mail.html).toContain("Title 1");
    expect(mail.html).toContain("Title 2");
    expect(mail.html).toContain("Body 1");
    expect(mail.html).toContain("Body 2");
  });

  it("uses a singular subject for exactly one item", async () => {
    const mail = await buildDigestEmail(fakeEnv(), [fakeItem(1)]);
    expect(mail.subject).toBe("[Review] 1 blog draft ready for review");
  });

  it("uses a plural subject with count for multiple items", async () => {
    const items = [fakeItem(1), fakeItem(2), fakeItem(3), fakeItem(4), fakeItem(5)];
    const mail = await buildDigestEmail(fakeEnv(), items);
    expect(mail.subject).toBe("[Review] 5 blog drafts ready for review");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run (from `blog-review-email/`): `pnpm test`
Expected: FAIL — `buildDigestEmail` is not exported from `./approval_email` yet.

- [ ] **Step 4: Replace `buildApprovalEmail` with `buildDigestEmail`**

```typescript
// blog-review-email/src/approval_email.ts
import type { Env } from "./router";
import type { Proposal } from "./store";
import { signUrl } from "./hmac";
import { tiptapToHtml, tiptapToPlaintext } from "./tiptap_render";

const LINK_TTL_SECONDS = 7 * 86400;

export type DigestItem = {
  proposal: Proposal;
  approveNonce: string;
  rejectNonce: string;
  content: unknown;
};

export async function buildDigestEmail(
  env: Env,
  items: DigestItem[],
): Promise<{ subject: string; html: string; plaintext: string }> {
  const exp = Math.floor(Date.now() / 1000) + LINK_TTL_SECONDS;
  const base = env.PUBLIC_BASE_URL.replace(/\/$/, "");

  const sections = await Promise.all(
    items.map(async (item) => {
      const approve = base + (await signUrl(`/a/${item.approveNonce}`, exp, env.HMAC_SECRET));
      const reject = base + (await signUrl(`/r/${item.rejectNonce}`, exp, env.HMAC_SECRET));
      return {
        title: item.proposal.title,
        summary: item.proposal.summary,
        adminUrl: item.proposal.adminUrl,
        approve,
        reject,
        contentHtml: tiptapToHtml(item.content),
        contentPlain: tiptapToPlaintext(item.content),
      };
    }),
  );

  const n = sections.length;
  const subject = `[Review] ${n} blog draft${n === 1 ? "" : "s"} ready for review`;

  const htmlSections = sections
    .map(
      (s) => `
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
  <h2 style="font-size:22px;color:#111;">${escapeHtml(s.title)}</h2>
  <p style="color:#374151;">${escapeHtml(s.summary)}</p>
  <p>
    <a href="${s.approve}" style="display:inline-block;padding:12px 24px;background:#059669;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Approve &amp; Publish</a>
    &nbsp;&nbsp;
    <a href="${s.reject}" style="display:inline-block;padding:12px 24px;background:#dc2626;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Reject</a>
  </p>
  <p style="font-size:13px;color:#6b7280;">Rejecting sends it back to draft — nothing is deleted. You can also
  review or edit it directly at <a href="${s.adminUrl}">${s.adminUrl}</a> before deciding.</p>
  <div style="color:#1f2937;line-height:1.6;">${s.contentHtml}</div>`,
    )
    .join("\n");

  const html = `
<!doctype html><html><body style="font-family:system-ui;color:#111;max-width:680px;margin:20px auto;padding:0 16px;">
  <h1 style="color:#0d3b66;font-size:20px;">${n} new blog draft${n === 1 ? "" : "s"} ready for review</h1>
  ${htmlSections}
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
  <p style="font-size:12px;color:#9ca3af;">These links expire in 7 days.</p>
</body></html>`;

  const plaintextSections = sections
    .map(
      (s, i) =>
        `--- ${i + 1}/${n}: ${s.title} ---\n\n` +
        `${s.summary}\n\n` +
        `Approve & Publish: ${s.approve}\n` +
        `Reject          : ${s.reject}\n\n` +
        `Review/edit first: ${s.adminUrl}\n\n` +
        `${s.contentPlain}`,
    )
    .join("\n\n");

  const plaintext =
    `${n} NEW BLOG DRAFT${n === 1 ? "" : "S"} READY FOR REVIEW\n\n` +
    `${plaintextSections}\n\n` +
    `These links expire in 7 days.\n`;

  return { subject, html, plaintext };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS, all 4 tests.

- [ ] **Step 6: Commit**

```bash
cd /home/ez/Code/navigo/klaussa-lab/blog-review-email
git add vitest.config.ts src/approval_email.test.ts src/approval_email.ts
git commit -m "Replace buildApprovalEmail with buildDigestEmail for N-item digests"
```

---

## Task 2: `blog-review-email` — router digest intake

**Files:**
- Modify: `blog-review-email/src/router.ts:58-113` (the `IntakePayload`
  type and the `/internal/blog-proposal` route)

**Interfaces:**
- Consumes: `buildDigestEmail`, `DigestItem` from `./approval_email`
  (Task 1). `createProposal` from `./store` (existing, unchanged —
  already returns one independent `{proposal, approveNonce,
  rejectNonce}` per call, which is exactly what makes per-item
  independent approve/reject work with zero changes to `store.ts`).
  `getBlogForReview` from `./blog_api` (existing, unchanged).
- Produces: the live `/internal/blog-proposal` endpoint now expects
  `{items: Array<{blog_id: string; title: string; summary: string}>,
  admin_url: string, to: string}` instead of a single blog — this is the
  shape Task 5/6's prompt-file changes must send.

This route handler isn't unit-tested here — testing it properly needs
mocking `env.PROPOSAL_KV`, `fetch` (for `getBlogForReview`/backend calls),
and `env.EMAIL`, which is real effort not justified for glue code whose
main risk is integration-level. It's verified for real in Step 3 below
(a live call against the deployed worker) and again end-to-end in Task 7.

- [ ] **Step 1: Replace the intake handler**

```typescript
// blog-review-email/src/router.ts
// Replace lines 43-113 (imports through the end of the /internal/blog-proposal route)
import { verifyRequestSignature, verifySignedUrl } from "./hmac";
import { claimNonce, createProposal } from "./store";
import { buildDigestEmail, type DigestItem } from "./approval_email";
import { sendEmailViaCF } from "./email_send";
import { approveBlog, getBlogForReview, rejectBlog } from "./blog_api";

function html(body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>Blog Review</title>` +
    `<style>body{font-family:system-ui;max-width:520px;margin:60px auto;padding:0 20px;color:#111;line-height:1.5;}` +
    `h1{color:#0d3b66;font-size:22px;}a{color:#0d3b66;}</style></head><body>${body}</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

type IntakeItem = { blog_id: string; title: string; summary: string };
type IntakePayload = {
  items: IntakeItem[];
  admin_url: string;
  to: string;
};

route("POST", "/internal/blog-proposal", async (req, env, _ctx) => {
  const rawBody = new Uint8Array(await req.arrayBuffer());
  const ok = await verifyRequestSignature(
    rawBody,
    req.headers.get("X-Klaussa-Signature"),
    req.headers.get("X-Klaussa-Timestamp"),
    env.HMAC_SECRET,
    Math.floor(Date.now() / 1000),
  );
  if (!ok) return new Response("invalid signature", { status: 401 });

  let payload: IntakePayload;
  try { payload = JSON.parse(new TextDecoder().decode(rawBody)); }
  catch { return new Response("bad json", { status: 400 }); }

  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: "items must be a non-empty array" }),
      { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const digestItems: DigestItem[] = [];
  for (const item of payload.items) {
    // Fetch the post itself rather than trusting the intake payload's title —
    // the reviewer needs to see what's actually stored, not what the cron job
    // claims it wrote.
    let blog;
    try {
      blog = await getBlogForReview(env, item.blog_id);
    } catch (e) {
      console.error("getBlogForReview failed", item.blog_id, e);
      return new Response(JSON.stringify({ ok: false, error: `could not fetch blog ${item.blog_id} for review` }),
        { status: 502, headers: { "Content-Type": "application/json" } });
    }

    const { proposal, approveNonce, rejectNonce } = await createProposal(env, {
      blogId: item.blog_id,
      title: blog.title,
      summary: item.summary,
      adminUrl: payload.admin_url,
    });
    digestItems.push({ proposal, approveNonce, rejectNonce, content: blog.content });
  }

  const mail = await buildDigestEmail(env, digestItems);
  const sent = await sendEmailViaCF(env, {
    to: payload.to,
    subject: mail.subject,
    html: mail.html,
    plaintext: mail.plaintext,
  });
  if (!sent.ok) {
    return new Response(JSON.stringify({ ok: false, error: sent.error }),
      { status: 502, headers: { "Content-Type": "application/json" } });
  }
  return new Response(
    JSON.stringify({ ok: true, proposal_ids: digestItems.map((d) => d.proposal.id) }),
    { headers: { "Content-Type": "application/json" } },
  );
});
```

Leave everything from `route("GET", "/a/:nonce", ...)` onward (lines
115-157 in the current file) exactly as-is — approve/reject already key
off `blog_id`+token independent of digest vs single-item, per the spec.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Verify live against a real test post**

This mirrors how the original single-item flow was verified earlier this
session. From `seo-geo-cron/` (this repo, or `autoseo-cron-runtime`),
source `.env.local` for `BACKEND_URL`, `WRITER_EMAIL`, `WRITER_PASSWORD`,
`BLOG_REVIEW_WORKER_URL`, `BLOG_REVIEW_HMAC_SECRET`,
`BLOG_REVIEW_RECIPIENT`, then:

```bash
# Create two real need_approval test posts as the writer bot
TOKEN=$(curl -s -X POST "$BACKEND_URL/api/v1/auth/sign-in" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$WRITER_EMAIL\",\"password\":\"$WRITER_PASSWORD\"}" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['session']['access_token'])")

BLOG1=$(curl -s -X POST "$BACKEND_URL/api/v1/blogs" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"[TEST] Digest item 1","content":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Test body 1."}]}]},"status":"need_approval","tags":["test"]}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")

BLOG2=$(curl -s -X POST "$BACKEND_URL/api/v1/blogs" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"[TEST] Digest item 2","content":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Test body 2."}]}]},"status":"need_approval","tags":["test"]}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")

# Send one digest intake covering both
TS=$(date +%s)
BODY=$(python3 -c "
import json
print(json.dumps({
  'items': [
    {'blog_id': '$BLOG1', 'title': '[TEST] Digest item 1', 'summary': 'First test item'},
    {'blog_id': '$BLOG2', 'title': '[TEST] Digest item 2', 'summary': 'Second test item'},
  ],
  'admin_url': 'https://klaussa.com/blogs/dashboard',
  'to': '$BLOG_REVIEW_RECIPIENT',
}))
")
SIG=$(printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "$BLOG_REVIEW_HMAC_SECRET" -r | awk '{print $1}')
curl -s -X POST "$BLOG_REVIEW_WORKER_URL/internal/blog-proposal" \
  -H "Content-Type: application/json" \
  -H "X-Klaussa-Signature: sha256=$SIG" -H "X-Klaussa-Timestamp: $TS" \
  -d "$BODY"
```

Confirm: the curl returns `{"ok":true,"proposal_ids":[...]}` with 2 ids,
one email arrives with both titles/bodies and two independent
Approve/Reject link pairs. Then **clean up**: reject both test posts
using their reject links (or `PATCH .../blogs/$BLOG1
{"status":"draft"}` / same for `$BLOG2` directly, using the approver
credential) so no test content lingers as `need_approval` in production.

Note: this step is against the **currently deployed** worker, which is
still running the old single-item code until Task 3 deploys this change
— run Step 3 *after* Task 3's deploy, not before.

- [ ] **Step 4: Commit**

```bash
cd /home/ez/Code/navigo/klaussa-lab/blog-review-email
git add src/router.ts
git commit -m "Accept a digest of items in /internal/blog-proposal instead of one blog"
```

---

## Task 3: Deploy `blog-review-email`

**Files:** none — deploy only.

- [ ] **Step 1: Deploy**

```bash
cd /home/ez/Code/navigo/klaussa-lab/blog-review-email
pnpm run deploy
```

- [ ] **Step 2: Confirm the deployed URL is unchanged**

The output URL must still match `BLOG_REVIEW_WORKER_URL` in
`seo-geo-cron/.env.local` (`https://blog-review-email.navigoinfo-id.workers.dev`)
— this is a redeploy of the same Worker, not a new one. If it differs,
stop and reconcile before proceeding; Tasks 5-8 depend on this URL being
correct.

- [ ] **Step 3: Run Task 2's Step 3 live verification now**

Now that the digest endpoint is actually live, go back and run Task 2's
Step 3 (the two-test-post digest call) against the deployed URL, and
clean up the test posts afterward as described there.

---

## Task 4: `_common.md` — per-job cap + shared outcome-tracking schema

**Files:**
- Modify: `seo-geo-cron/prompts/_common.md`

**Interfaces:**
- Produces: the `actions.sqlite` schema and the "check past actions
  before proposing new ones" instruction that both Task 5 (`seo.md`) and
  Task 6 (`geo.md`) reference by name ("`_common.md`'s Outcome tracking
  section") rather than repeating.

- [ ] **Step 1: Replace the guardrail cap line**

In the `## Guardrails (all jobs)` section, replace:

```
- Max **one** PR/content draft and **one** escalation issue per run.
```

with:

```
- Content-draft cap is per job: SEO up to **5** per run, GEO up to **2**
  per run — delivered as **one digest email** per run regardless of item
  count (see "Outcome tracking" below). Escalation cap stays **one**
  issue per run for every job, unchanged.
```

- [ ] **Step 2: Add the Outcome tracking section**

Insert a new `## Outcome tracking (\`actions.sqlite\`)` section between
`## Budget discipline` and `## Guardrails (all jobs)`:

```markdown
## Outcome tracking (`actions.sqlite`)

Every content-drafting job (SEO, GEO) shares one SQLite file,
`seo-geo-cron/data/actions.sqlite` (gitignored — separate from
`geo-history.sqlite`, which tracks per-prompt citation results, a
different concern). Create it if absent:

```sql
CREATE TABLE IF NOT EXISTS actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job TEXT NOT NULL CHECK (job IN ('seo', 'geo')),
  run_date TEXT NOT NULL,
  cluster_topic TEXT NOT NULL,
  cluster_keywords TEXT NOT NULL,
  target_page_url TEXT,
  action_type TEXT NOT NULL,
  blog_id TEXT,
  baseline_metrics TEXT,
  status TEXT NOT NULL CHECK (status IN ('drafted', 'proposed', 'judged')),
  outcome TEXT CHECK (outcome IN ('improved', 'flat', 'worse', 'rejected')),
  outcome_metrics TEXT,
  created_at TEXT NOT NULL,
  judged_at TEXT
);
```

`cluster_keywords`, `baseline_metrics`, and `outcome_metrics` are JSON
stored as text (SQLite has no native JSON type). `baseline_metrics` /
`outcome_metrics` shape: `{"position": <number|null>, "ctr":
<number|null>, "impressions": <number|null>, "clicks": <number|null>,
"measured_at": "<date>"}`.

**Step 0 of every run, before anything else**: query your own job's rows
(`WHERE job = '<seo|geo>'` — the table is shared for storage convenience,
never cross-check the other job's rows) where `status = 'proposed'` and
`run_date` is 14 or more days ago.

- None found → proceed straight to this job's own instructions.
- For each match, `GET /blogs/{blog_id}` (free, read-only — a fresh read
  on a new run, not polling within a run):
  - Still `need_approval` after 14+ days → escalate once this run, naming
    every such `blog_id` in one issue titled "[SEO/GEO] N drafts
    unreviewed after 14+ days" (sitting unreviewed for two weeks is
    itself a signal worth surfacing).
  - `status: draft` (was rejected) → `UPDATE actions SET
    status='judged', outcome='rejected', judged_at=<today> WHERE
    id=<row id>`. No further action for that row.
  - `status: published` → pull fresh GSC performance for
    `target_page_url` (same dimensions as your normal run), compare
    against `baseline_metrics`. Judge `improved`/`flat`/`worse` the same
    way you'd judge any other threshold in this file — meaningful
    movement in position or CTR, not a rigid formula. Write `outcome`,
    `outcome_metrics`, `status='judged'`, `judged_at=<today>`.

Only once Step 0 is done for every eligible row do you move on to finding
new opportunities.
```

- [ ] **Step 3: Sanity-check the embedded SQL**

```bash
sqlite3 :memory: "CREATE TABLE IF NOT EXISTS actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job TEXT NOT NULL CHECK (job IN ('seo', 'geo')),
  run_date TEXT NOT NULL,
  cluster_topic TEXT NOT NULL,
  cluster_keywords TEXT NOT NULL,
  target_page_url TEXT,
  action_type TEXT NOT NULL,
  blog_id TEXT,
  baseline_metrics TEXT,
  status TEXT NOT NULL CHECK (status IN ('drafted', 'proposed', 'judged')),
  outcome TEXT CHECK (outcome IN ('improved', 'flat', 'worse', 'rejected')),
  outcome_metrics TEXT,
  created_at TEXT NOT NULL,
  judged_at TEXT
);" && echo "DDL is valid"
```

Expected: `DDL is valid`, no error output.

- [ ] **Step 4: Commit**

```bash
cd /home/ez/Code/navigo/klaussa-lab/autoseo/.claude/worktrees/seo-geo-cron-spec
git add seo-geo-cron/prompts/_common.md
git commit -m "Add shared actions.sqlite outcome tracking; raise content cap per-job"
git push klaussa-fork worktree-seo-geo-cron-spec
```

---

## Task 5: `seo.md` — cluster-then-cap, Step 0, digest loop, daily/cap-5

**Files:**
- Modify: `seo-geo-cron/prompts/seo.md` (full rewrite)

**Interfaces:**
- Consumes: `_common.md`'s Outcome tracking section (Task 4) by
  reference, not by repeating its content.

Note the design correction versus the spec's §3 as literally written: the
spec's cluster-then-cap procedure only covers decision rules 3
(competitor outranks) and 4 (high-volume, unranked), which are the two
rules that source candidates from `rank-keywords.json`'s tracked keyword
groups. Rules 1 (ranks well, converts badly) and 2 (position dropped) are
already page-level — sourced from `keyPages`/GSC/rank-tracker history
directly, not from those keyword groups — exactly like today's real pilot
found the "Denda Telat Bayar Gaji" page via rule 1, independent of any
tracked keyword. All four rules must contribute candidates to the same
top-5 ranking; cluster-then-cap is specifically how rule 3/4 candidates
get grouped before they're comparable to rule 1/2's already-page-level
candidates.

- [ ] **Step 1: Rewrite the file**

```markdown
# SEO job

Daily. Turns ranking and search-console data into up to 5 content
actions, delivered as one digest email.

## What to do

0. **Outcome tracking first.** Follow `_common.md`'s "Outcome tracking"
   section — check and judge any of your own (`job='seo'`) past actions
   that are due, before anything else below.
1. `get_rank_tracker` for tracked positions and history. If `configs` is
   empty no tracker exists yet — escalate once with "[SEO/GEO] rank
   tracker not configured" (check the issue does not already exist
   first), then continue with the GSC-only analysis below.
2. `get_search_console_performance` (`dateRange: "last_28_days"`,
   dimensions `["query"]` and `["page"]`). Free — use it every run.
3. Optionally `get_google_analytics_organic_overview` for traffic trend
   (free).

## Finding today's opportunities

Build one candidate list from all four decision rules below, across
every signal source, then take the top 5 by priority. Never stop at the
first match — that was last week's behavior; daily cadence means walking
every rule to see the full picture, then picking the strongest 5.

Read `current_goal` from context first — it names the specific thing this
POC is trying to move, and that outranks generic best practice.

1. **Rule 1 candidates (highest priority): a key page ranks well but
   converts badly.** Scan `keyPages` from context against fresh GSC data
   for pages at position 4-15 with CTR under ~2% — each qualifying page
   is one candidate, already page-level, no grouping needed. This is the
   highest-value action for klaussa.com: the blog draws ~1.6x the
   impressions of the regulation pages and converts them at about a
   fifth of the rate. `keyPages` records measured CTR per page — compare
   against the best-converting page in that list to see what "good"
   looks like on this site.
2. **Rule 2 candidates: position dropped vs. the prior period.** Any
   tracked keyword with a real position drop vs. the prior rank-tracker
   snapshot is one candidate. Check the technical-health job's latest
   audit (`get_audit_issues`, no auditId = latest, free) for a technical
   cause on that page before assuming it is a content problem — if
   there is one, note the correlation rather than re-diagnosing it.
3. **Rule 3/4 candidates: cluster-then-cap.** Rules 3 (a competitor
   outranks us) and 4 (a high-volume keyword we do not rank for at all)
   both source from `rank-keywords.json`'s tracked keyword groups, which
   is where raw keyword strings need grouping into real page-level
   opportunities before they're comparable to rules 1-2's candidates:

   a. Read `quick-win-striking-distance` → `gap-not-ranking` →
      `high-volume-deep` in that priority order.
   b. Query `actions.sqlite` for every keyword already covered by any
      past `seo` row (`SELECT cluster_keywords FROM actions WHERE
      job='seo'`, union the JSON arrays). Drop those keywords from each
      group.
   c. Group what's left by topic — judgment, not string matching. Two
      keywords belong in one cluster only if a single page/section could
      fully answer both without duplicating content elsewhere.
      Calibration (apply this bar consistently, not looser or tighter
      than these examples):
      - Same cluster: "perbedaan mk dan ma" / "kewenangan mk" / "tugas ma
        dan mk" / "tugas mahkamah agung dan mahkamah konstitusi" (MK vs
        MA authority — no shared root word beyond "mk"/"ma", still one
        topic).
      - Same cluster: "sp-1 adalah" / "sp 1 adalah" / "sp 3 adalah"
        (employee warning letters).
      - Same cluster: "apa itu trademark" / "trade mark artinya" (same
        topic despite sharing no substring).
      - Not the same cluster: "hak dpr" and "kode etik profesi" — both
        generic legal terms, unrelated topics.
   d. For `quick-win-striking-distance` clusters: check whether a
      competitor outranks us there (rule 3) — Competitors come from
      `get_project_context`, not a hardcoded list, and the SERP itself
      may show others you were not told about. Fetch their ranking page,
      diff against ours. If no clear competitor gap, it's still a
      legitimate "already ranking, could rank higher" candidate. For
      `gap-not-ranking`/`high-volume-deep` clusters: these are rule 4 by
      definition (we don't rank at all, or rank past position 40) — draft
      a new page. Lowest priority: strengthening a page that already
      ranks beats starting from zero.
   e. Each resulting cluster is one candidate.

## Ranking and capping

Combine every candidate from rules 1-4 above into one list. Rank: rule 1
> rule 2 > rule 3 > rule 4 (matches the priority order above); within a
tier, by the size of the opportunity (impressions/CTR gap for rules 1-2,
summed `opp` score from `rank-keywords.json`'s `metrics` for rules 3-4).
Take the top 5.

Fewer than 5 genuine candidates across all four rules → do fewer. Never
pad with a 6th lower-value or single-keyword action to hit the cap —
append a note to the research log flagging the pool is thinning instead.

## Publishing: draft all chosen candidates, then send one digest

Blog content is DB-backed (Supabase via `api.klaussa.com`), not files in
`klaussa_fe` — there is no repo to PR for a blog post. Required env vars
are already exported by `run.sh`; read them from the environment, never
print them.

Follow `writing_preferences` from context — it is binding, not advisory.

Sign in as the writer bot once (it cannot publish, by design):
```bash
TOKEN=$(curl -s -X POST "$BACKEND_URL/api/v1/auth/sign-in" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$WRITER_EMAIL\",\"password\":\"$WRITER_PASSWORD\"}" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['session']['access_token'])")
```

For **each** of the up to 5 chosen candidates, in order:

1. Create the draft. `content` is a Tiptap JSON doc, not markdown:
   `heading` nodes (`"attrs":{"level":2}`) for section titles, `paragraph`
   nodes for body. Always `"status":"need_approval"` — never `draft`
   (invisible to the reviewer) or `published` (you cannot set it anyway).
   ```bash
   BLOG=$(curl -s -X POST "$BACKEND_URL/api/v1/blogs" \
     -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
     -d '{"title":"...","content":{...},"status":"need_approval","tags":["seo"]}')
   BLOG_ID=$(echo "$BLOG" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
   ```
2. Immediately record it — do not wait until all candidates are drafted:
   ```bash
   sqlite3 seo-geo-cron/data/actions.sqlite "INSERT INTO actions
     (job, run_date, cluster_topic, cluster_keywords, target_page_url,
      action_type, blog_id, baseline_metrics, status, created_at)
     VALUES ('seo', date('now'), '<topic>', '<json array of keywords>',
      <'target url' or NULL>, '<edit-existing|new-page|faq-block>',
      '$BLOG_ID', '<json baseline metrics>', 'drafted', datetime('now'));"
   ```
   Writing this immediately after each draft — not batched at the end —
   means an interrupted run never leaves a drafted-but-unrecorded item
   that tomorrow's exclusion set (rule 3/4 step b above) would miss.

Once every chosen candidate has a draft and an `actions.sqlite` row, send
**one** digest covering all of them. HMAC-sign the batched body:
```bash
TS=$(date +%s)
BODY=$(python3 -c "
import json
items = [
  {'blog_id': '<blog_id_1>', 'title': '<title_1>', 'summary': '<summary_1>'},
  # ... one entry per candidate actually drafted this run
]
print(json.dumps({'items': items,
  'admin_url': 'https://klaussa.com/blogs/dashboard',
  'to': '$BLOG_REVIEW_RECIPIENT'}))
")
SIG=$(printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "$BLOG_REVIEW_HMAC_SECRET" -r | awk '{print $1}')
curl -s -X POST "$BLOG_REVIEW_WORKER_URL/internal/blog-proposal" \
  -H "Content-Type: application/json" \
  -H "X-Klaussa-Signature: sha256=$SIG" -H "X-Klaussa-Timestamp: $TS" \
  -d "$BODY"
```
The worker renders each item's full draft into the email, so each
summary is context for that item's decision, not a substitute for the
content.

**If this call fails** (non-2xx, or no response): escalate once, titled
"[SEO/GEO] digest send failed — N drafts orphaned", listing every
`blog_id` drafted this run. Do not leave them unrecorded and unreachable
— they are already in `need_approval` with no email pointing at them.

**On success**, flip every row drafted this run from `drafted` to
`proposed`:
```bash
sqlite3 seo-geo-cron/data/actions.sqlite "UPDATE actions SET status='proposed'
  WHERE job='seo' AND run_date=date('now') AND status='drafted';"
```

Then stop. A human decides from the email. Do not poll for their
decision.

## After acting

For each candidate acted on, add a short `appendResearchLog` entry naming
the page/topic and the keyword cluster, so tomorrow's run can see what
was already attempted without needing to open the SQLite file.
```

- [ ] **Step 2: Sanity-check the file's structure**

```bash
grep -c "^## " seo-geo-cron/prompts/seo.md
```

Expected: `5` (What to do, Finding today's opportunities, Ranking and
capping, Publishing, After acting).

- [ ] **Step 3: Commit**

```bash
git add seo-geo-cron/prompts/seo.md
git commit -m "SEO: daily cadence, cap 5, cluster-then-cap opportunity discovery, digest publish"
git push klaussa-fork worktree-seo-geo-cron-spec
```

---

## Task 6: `geo.md` — Step 0, digest loop, cap-2

**Files:**
- Modify: `seo-geo-cron/prompts/geo.md` (full rewrite)

**Interfaces:**
- Consumes: `_common.md`'s Outcome tracking section (Task 4), `seo.md`'s
  Publishing mechanics (Task 5) by reference.

GEO's opportunities already come directly from that week's fresh
`explore_prompt` citation results — up to 22 prompts, cap of 2 — so
unlike SEO it does not need the same multi-rule-source ranking; only a
much lighter grouping step for the (rare, small-N) case where two gap
prompts clearly target the same page.

- [ ] **Step 1: Rewrite the file**

```markdown
# GEO job

Weekly, an hour after the SEO job. Measures whether LLMs cite
klaussa.com, and acts on up to 2 citation gaps per run, delivered as one
digest email.

## What to do

0. **Outcome tracking first.** Follow `_common.md`'s "Outcome tracking"
   section — check and judge any of your own (`job='geo'`) past actions
   that are due, before anything else below.
1. Open `seo-geo-cron/data/geo-history.sqlite` (relative to the repo
   root). Create it if absent:
   ```sql
   CREATE TABLE IF NOT EXISTS geo_runs (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     run_date TEXT NOT NULL,
     prompt_or_query TEXT NOT NULL,
     source TEXT NOT NULL CHECK (source IN ('prompt_explorer', 'brand_lookup')),
     model_or_platform TEXT NOT NULL,
     cited INTEGER NOT NULL,
     competitor_cited INTEGER NOT NULL,
     share_of_voice_pct REAL
   );
   ```
2. Read `seo-geo-cron/data/prompts.json` for the prompt set. If it is
   missing, escalate "[SEO/GEO] GEO prompt set not configured" and stop —
   do not invent prompts. Run the tier and model list this month's
   `budget.json` entry specifies (month 1: all 22 prompts x chat_gpt +
   gemini) — `budget.json` is authoritative on prompt volume if this
   count ever drifts from it again.
3. For each prompt, `explore_prompt` with `highlightBrand: "klaussa"`.
4. `lookup_brand` with `query: "klaussa"` and `competitors` taken from
   `get_project_context` — the canonical list, not a hardcoded one. This
   is the one place competitors must be supplied explicitly: share-of-
   voice is arithmetically meaningless without named rivals to divide
   against.
5. Insert one `geo_runs` row per (prompt, model) and per (query,
   platform).

## Finding this week's opportunities

1. From this run's `explore_prompt` results, list every prompt where a
   competitor is cited and klaussa.com is not.
2. Query `actions.sqlite` for prompts already covered by any past `geo`
   row (`SELECT cluster_keywords FROM actions WHERE job='geo'` — for
   GEO, `cluster_keywords` holds the prompt text(s) a past action
   addressed, not tracked keywords). Drop already-covered prompts.
3. If two or more remaining gap prompts clearly target the same
   underlying page/topic — the same bar as SEO's clustering: one page
   could fully answer both — treat them as one opportunity.
4. Rank remaining opportunities: a clear diff-and-close case (a specific
   competitor page maps directly onto something klaussa.com could
   plausibly own) ranks above a vague thematic gap.
5. Take the top 2. Fewer than 2 → do fewer, no padding.

## Decision rules

- **A competitor is cited and we are not, for the same prompt** — the
  case handled by "Finding this week's opportunities" above. Diff their
  cited page against our closest equivalent (see `keyPages` in context)
  and draft content closing the gap.
- **We are cited but the cited text looks wrong or outdated** —
  cross-check against the live page → **escalate immediately**, no
  auto-fix. This is separate from the 2-opportunity cap above — it can
  escalate in addition to, not instead of, the 2 content actions.
  Factual correctness about Indonesian law needs a human. Title:
  "[SEO/GEO] possible wrong info cited: <prompt>".
- **We are cited and it is accurate** → low priority, not an
  opportunity. Record it; only act if there's an obvious cheap
  reinforcement and cap remains.
- **Share-of-voice for a query dropped vs the last 2+ `geo_runs` rows** →
  escalate as one digest issue covering every query that dropped (still
  subject to the one-escalation-per-run cap in `_common.md` — if both
  this and the wrong-citation case above fire the same run, combine them
  into one escalation issue rather than two).
- **Zero citations for anyone on a prompt** → pass. The prompt is not a
  citation opportunity for this market; note it and deprioritise.

## Publishing: draft all chosen opportunities, then send one digest

Use the **exact publishing mechanics in `seo.md`'s "Publishing" section**
(writer bot sign-in, `need_approval` Tiptap draft, immediate
`actions.sqlite` row per draft with `job='geo'`, then one combined
digest intake call for everything drafted this run, flip
`drafted`→`proposed` on success, escalate naming orphaned `blog_id`s on
failure). This job never PRs `klaussa_fe` for content either.

Then stop. A human decides from the email. Do not poll for their
decision.

## Baseline discipline

The POC compares week 1 against week 4 using the **same** prompt set and
the **same** model pair. If you change either, the comparison measures
your change rather than Klaussa's progress. Do not swap models or edit
the prompt set mid-month — if the set looks wrong, escalate and let a
human decide.

Append an `appendResearchLog` entry each run recording the run date,
prompt count, models used, and how many prompts cited klaussa.com — so
the trend is readable from project context without opening the SQLite
file.
```

- [ ] **Step 2: Sanity-check the file's structure**

```bash
grep -c "^## " seo-geo-cron/prompts/geo.md
```

Expected: `5` (What to do, Finding this week's opportunities, Decision
rules, Publishing, Baseline discipline).

- [ ] **Step 3: Commit**

```bash
git add seo-geo-cron/prompts/geo.md
git commit -m "GEO: cap 2, actions.sqlite outcome tracking, digest publish"
git push klaussa-fork worktree-seo-geo-cron-spec
```

---

## Task 7: Pilot-verify the SEO changes

**Files:** none — verification only.

- [ ] **Step 1: Run the pilot**

```bash
cd /home/ez/Code/navigo/klaussa-lab/autoseo/.claude/worktrees/seo-geo-cron-spec/seo-geo-cron
./pilot-run.sh seo
```

This is a real, constrained run (pauses before any git push / `gh pr
create` / `gh issue create` — there are none in this job anyway, only
HTTP calls and `sqlite3`, so it should run to completion without
pausing).

- [ ] **Step 2: Read the log and confirm expected behavior**

```bash
cat seo-geo-cron/data/seo-pilot.log
sqlite3 seo-geo-cron/data/actions.sqlite "SELECT job, cluster_topic, status, blog_id FROM actions WHERE job='seo' ORDER BY id;"
```

Confirm:
- Step 0 ran and found nothing to judge (this is the first-ever run
  against a fresh `actions.sqlite` — no prior `proposed` rows can exist
  yet).
- More than one candidate was considered (not stopping at the first
  match, unlike the pre-this-plan behavior).
- No more than 5 `actions.sqlite` rows were inserted for today's
  `run_date`.
- Every inserted row has `status='proposed'` (not stuck at `drafted`,
  which would mean the digest send failed silently) — if any row shows
  `drafted`, check the log for the escalation the job should have filed
  per the "digest send failed" instruction.
- Exactly one digest email arrived, containing every drafted item from
  this run with independent Approve/Reject links.

- [ ] **Step 3: Clean up test-quality output if needed**

If the run's real judgment produced a genuinely reasonable draft, leave
it in `need_approval` for real review as usual. If something looks
structurally wrong (e.g., cannibalizing an existing page, or a
malformed Tiptap doc), reject it via its email link so it doesn't sit in
`need_approval` indefinitely, and note what went wrong for a follow-up
prompt fix.

---

## Task 8: Pilot-verify the GEO changes

**Files:** none — verification only.

- [ ] **Step 1: Run the pilot**

```bash
cd /home/ez/Code/navigo/klaussa-lab/autoseo/.claude/worktrees/seo-geo-cron-spec/seo-geo-cron
./pilot-run.sh geo
```

- [ ] **Step 2: Read the log and confirm expected behavior**

```bash
cat seo-geo-cron/data/geo-pilot.log
sqlite3 seo-geo-cron/data/actions.sqlite "SELECT job, cluster_topic, status, blog_id FROM actions WHERE job='geo' ORDER BY id;"
```

Confirm: Step 0 found nothing to judge (same reasoning as Task 7), no
more than 2 `job='geo'` rows for today, all `status='proposed'`, one
digest email (separate from SEO's) with independent Approve/Reject links
per item.

- [ ] **Step 3: Clean up test-quality output if needed**

Same as Task 7 Step 3.

---

## Task 9: Update the crontab

**Files:** none — this is OS-level cron state on the laptop, at the
dedicated runtime clone (`/home/ez/Code/navigo/klaussa-lab/autoseo-cron-runtime`),
not a git-tracked file. Only proceed once Tasks 1-8 are pilot-verified —
this is deliberately the last step.

- [ ] **Step 1: Confirm the runtime clone has the new commits**

```bash
cd /home/ez/Code/navigo/klaussa-lab/autoseo-cron-runtime
git pull
```

Expected: fast-forwards to include every commit from Tasks 4-6.

- [ ] **Step 2: Update the SEO line to daily**

```bash
crontab -l > /tmp/klaussa-seo-geo-updated.crontab
```

Edit `/tmp/klaussa-seo-geo-updated.crontab`, changing the `seo` line from:

```
30 14 * * 1  /bin/bash /home/ez/Code/navigo/klaussa-lab/autoseo-cron-runtime/seo-geo-cron/run.sh seo >> /home/ez/Code/navigo/klaussa-lab/autoseo-cron-runtime/seo-geo-cron/data/seo.cron-wrapper.log 2>&1
```

to (removing the `1` day-of-week restriction — every other field and the
`geo` line stay exactly as they are):

```
30 14 * * *  /bin/bash /home/ez/Code/navigo/klaussa-lab/autoseo-cron-runtime/seo-geo-cron/run.sh seo >> /home/ez/Code/navigo/klaussa-lab/autoseo-cron-runtime/seo-geo-cron/data/seo.cron-wrapper.log 2>&1
```

- [ ] **Step 3: Install and verify**

```bash
crontab /tmp/klaussa-seo-geo-updated.crontab
crontab -l
```

Confirm the `seo` line now reads `30 14 * * *` (daily) and the `geo` line
is unchanged (`0 15 * * 1`, weekly).
