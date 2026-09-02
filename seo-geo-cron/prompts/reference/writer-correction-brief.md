# Klaussa correction brief — fixing a live page

You are correcting ONE already-published post on klaussa.com. This is surgery,
not a rewrite. The page has readers and (in some cases) ranking history; your
job is to remove what is wrong and leave everything else intact.

## Rules

1. **Fix what is listed as wrong. Do not restructure the article.** Keep its
   title (unless told otherwise), its slug, its voice, its heading order, and
   every section that is not defective. A reader who knows the page should
   recognise it afterwards.
2. **Never invent a replacement.** Every corrected fact must come from primary
   text you have read. Klaussa's own corpus is the fastest route:
   ```
   GET https://api.klaussa.com/api/v1/laws/markdown/<doc_id>
   ```
   with the writer-bot bearer token AND a browser User-Agent (both
   api.klaussa.com and Supabase sit behind Cloudflare and 403 otherwise).
   Known doc_ids: UU 40/2007 = 152 · UU 6/2023 = 384 · UU 11/2020 = 73 ·
   PP 5/2021 = 2549 (**REPEALED — see PP 28/2025 = 784**) · PP 8/2021 = 2494 ·
   PP 7/2021 = 2510 · PP 35/2021 = 1929 · PP 12/2019 = 2149 ·
   UU 13/2003 = 84630 · UU 8/1999 = 107600 · UU 20/2023 = 63 ·
   PP 23/2021 = 2210 · UU 24/2003 (MK) = 84429 · UU 48/2009 = 82 ·
   UU 2/2004 = 60165 · UU 18/2003 (Advokat) = 84556 · PP 11/2017 = 1503 ·
   PP 49/2018 = 516 · UU 25/2004 = 59696 · UU 23/2014 = 393 ·
   UU 1/2023 (KUHP) = 485 · UU 1/2024 (ITE) = 3016 · UU 19/2016 (ITE) = 21 ·
   UU 27/2022 (PDP) = 54 · UU 10/2020 (Bea Meterai) = 102 ·
   UU 65/2024 (Paten) = 1708 · PP 55/2022 = 772 · PP 20/2026 = 306277 ·
   UU 12/2011 = 287 · UU 13/2022 = 298 · UU 5/1983 (ZEE) = 130369 ·
   UU 32/2014 = 234 · UU 31/2004 = 59577.

   Find others via `GET /api/v1/laws/title-search?q=<terms>` — **the parameter
   is `q`, not `query`**. Treat any "not in the corpus" result as UNPROVEN:
   this endpoint has produced four distinct false negatives on this project —
   identifier-only queries return `total: 0`; a transient
   `'coroutine' object is not iterable` also returns `total: 0`; it silently
   fails to surface some present documents (one writer cited UU 10/2020 from
   `markdown/102` while another concluded from search that it was absent); and
   `/laws/available`'s `hierarchies` needs the exact bentuk string.

   Where `markdown/<id>` 404s, try `pdf/<id>` — it returns a signed R2 URL.
   **KUHPerdata (999001) markdown 404s and the PDF the corpus points to is
   damaged at Pasal 1602z** (drops the heading and first alinea); verify that
   article against id.wikisource.org instead.
3. **If you cannot verify the correct value, delete the wrong claim rather
   than replacing it with a guess.** A page that is silent on a point is fine.
   A page that is confidently wrong is not. Report anything you deleted.
4. **While you are in there, do not fix things you were not asked to fix** —
   except an outright factual error you can prove, which you should correct and
   report. Style, length and structure are out of scope.

## Credentials

- writer bot: `/home/ez/Code/navigo/klaussa-lab/autoseo/.claude/worktrees/seo-geo-cron-spec/seo-geo-cron/.env.local`
  (`WRITER_EMAIL`, `WRITER_PASSWORD`) — for the corpus API
- service role: `/home/ez/Code/navigo/klaussa-specs/backend/.env`
  (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) — for reading and
  writing the blog row

Never print a credential.

## Scratch files

Other agents run in parallel. Make your own directory and stay in it:
```bash
WORK=$(mktemp -d /tmp/klaussa-fix-XXXXXX); cd "$WORK"
```

## How to read the current content

```bash
curl -s -A "$UA" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  "$SUPABASE_URL/rest/v1/blogs?slug=eq.<slug>&select=id,title,content,tags,meta_description"
```
`content` is a **Tiptap JSON doc**. Edit the JSON — do not convert to markdown
and back, that would lose link marks and formatting. A link is a mark on a text
node:
```json
{"type":"text","text":"anchor","marks":[{"type":"link","attrs":{"href":"https://..."}}]}
```

## How to write it back

```bash
curl -s -X PATCH "$SUPABASE_URL/rest/v1/blogs?id=eq.$BLOG_ID" \
  -A "$UA" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d @patch.json
```
`patch.json` contains `content`, and **also `updated_at` set to the current
UTC timestamp** (e.g. `"2026-08-29T12:34:56+00:00"`). There is no database
trigger — if you do not set it, the page will claim it has not changed since
publication, which would be false after your edit. Do NOT touch `created_at`,
`status`, `author_*` or `approver_*`.

Then:
1. Re-read the row and confirm your change is actually stored (do not trust the
   PATCH response alone — a writer in an earlier batch reported a field set that
   was still NULL).
2. `curl -s -o /dev/null -w "%{http_code}" https://www.klaussa.com/blog/<slug>`
   — expect 200.
3. **Confirm your edit actually rendered, using a cache-buster.** The canonical
   URL is served from a 24h edge cache, so the plain URL will keep showing the
   OLD text for up to a day and a correct write looks like a failed one.
   Appending any query string forces a re-render:
   ```bash
   curl -s "https://www.klaussa.com/blog/<slug>?cb=$RANDOM" | grep -o '<your new phrase>'
   ```
   Report the result of THIS check, not the plain-URL one. Do not conclude your
   edit failed because the plain URL still shows the old text — that is the
   documented cache behaviour, and the page will refresh on its own within 24h.

## Report back

- the slug and blog_id
- **a before/after for every single change**, quoting the old text and the new
- the primary source (URL or corpus doc_id + pasal) behind each corrected fact
- anything you deleted rather than replaced, and why
- anything you found wrong but did NOT change, and why
- confirmation that the row read-back matches and the page returns 200
