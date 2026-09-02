# Codex writer brief — new cycle, Wave 2

Read `/home/ez/.claude/jobs/285425d6/tmp/BRIEF.md` first. It is binding in full:
legal-accuracy rules, voice, Tiptap JSON format, tag vocabulary, credentials,
publish procedure, report format. This file **overrides it where they differ**.

A first Codex-written post (`sp2dk-adalah-cara-menjawab-dan-batas-waktunya`) was
published and reviewed. It was accurate and invented nothing — both its
citations verified. It fell short on two specific, fixable things. This brief
exists to fix exactly those.

---

## 1. Source hierarchy — this is the main change

The reviewed post cited two instruments by name, sourced from JDIH and from
DDTC. DDTC is a commercial tax firm's database. That is not good enough for a
site whose entire pitch is citing statute without hallucinating.

**Use sources in this order, and say in your report which you used for each
claim:**

1. **Klaussa's own corpus — the primary route, always try it first.**
   `GET https://api.klaussa.com/api/v1/laws/markdown/<doc_id>` returns the FULL
   statutory text. Find ids with `GET /api/v1/laws/title-search?q=<terms>` —
   the parameter is **`q`**, not `query`. Where `markdown/<id>` 404s, try
   `pdf/<id>`, which returns a signed R2 URL.
2. **Official JDIH** (jdih.kemenkeu.go.id, peraturan.bpk.go.id,
   peraturan.go.id, jdih.atrbpn.go.id) — when the corpus does not have it.
3. **Commercial databases** (DDTC, hukumonline, ortax) — **corroboration only.
   Never the sole basis for a citation.** If a commercial database is your only
   source for a provision, you do not have that provision: either find it
   elsewhere or leave the claim out.

**Read the actual statutory text, not a summary page.** A JDIH landing page
telling you a regulation exists is not the same as having read its articles.

---

## 2. Citation density — cite at article level

The reviewed post carried **2** distinct `Pasal` references across 962 words.
A comparable post written to this standard carried **15** across 1,418 words,
because its writer read the full text of the governing statute and its
implementing regulation.

**Every substantive legal claim gets a specific article.** Not "diatur dalam
PMK 111/2025" but "Pasal 6 ayat (2) PMK 111/2025". That includes:

- the definition of the instrument
- the deadline, and separately the consequence of missing it
- who issues it and under what authority
- every procedural step you describe
- every right the reader has

If you cannot find the article for a claim, **that is a signal the claim may be
practice rather than law** — say so explicitly ("dalam praktik…", "tidak ada
ketentuan yang mengatur…") rather than stating it flatly or dropping it
silently. Distinguishing statute from practice is itself valuable and no
competitor does it.

**A pattern worth copying:** the implementing regulation usually carries the
mechanics the parent statute delegates. Two writers this week independently
found the parent UU silent on a procedure everyone assumed was unregulated —
the whole thing lived in the PP. When a UU says "diatur lebih lanjut dengan
Peraturan Pemerintah", go read that PP.

---

## 3. Internal links — 5 minimum, including at least one regulation hub

The base brief says 2-4. **For this wave the floor is 5**, and at least one must
be a `/peraturan` hub or `/cari-peraturan/`.

**Enumerate hubs, do not guess them.** They are listed in
`https://www.klaussa.com/sitemap-hubs.xml` (409 hubs: 313 tema, 82 tahun,
14 jenis) and `sitemap-peraturan-{1..32}.xml`. Grep those for your cluster's
terms. Filter on the *concept*, not one keyword — a writer searching only
"pajak" missed six directly relevant hubs.

There are both **tema hubs** (`/peraturan/tema/<topic>`) and **per-document
hubs** (`/peraturan/<jenis>-no-<n>-tahun-<yyyy>-<slug>`). Linking a post to the
actual governing regulation in our own corpus is the point of this wave.

**Verify every link with GET, not HEAD** — `curl -I` returns 404 on
`/blog/<slug>` while GET returns 200. Use `/cari-peraturan/` with the trailing
slash; without it you get a 308.

---

## 4. Check existing coverage before writing

The site has **740 published posts**. Pull them and check your topic is not
already held.

**The listing is gated on authentication, and it fails silently.** Measured
back to back on 2026-09-02:

| call | rows |
|---|---|
| `GET /api/v1/blogs` — no `Authorization` header | **20** |
| `GET /api/v1/blogs` — with `Authorization: Bearer <token>` | **745** |

No error, no warning, HTTP 200 both times. `cf-cache-status: DYNAMIC`, and a
`?cb=` bust changes nothing, so this is not an edge cache — an unauthenticated
caller is simply served the 20 most recent posts.

**Send the bearer token on the listing call.** You already hold one for
publishing; reuse it (§5: sign in once, 10/min limit). A coverage check run
without it compares your topic against 20 posts out of 745 and will tell you a
covered topic is open.

Paging also works and is the safer habit:
`GET /api/v1/blogs?summary=true&per_page=100&page=N`, N from 1 upward until a
page returns fewer than 100 rows. The response is a bare JSON array with no
`total` wrapper, so you cannot read a count off page 1 — walk to the end.

Search titles *and* bodies — three writers this week correctly stopped on
topics their brief called open, because the coverage lived in a pillar's body
with no trace in its slug.

**Sanity-check your enumeration before trusting it.** If your coverage sweep
returns a suspiciously round or small number, you are looking at one page, not
the corpus of posts.

**If your topic is already covered at the same intent, stop and report it
rather than publishing a near-duplicate.** Stopping is a correct outcome.

---

## 5. Known traps

- **`POST /api/v1/blogs` silently drops `meta_description` AND `slug`**, returns
  200, and derives a slug from your title. Re-read the row; correct with a
  service-role PATCH before the publish flip if you want the assigned slug.
- **Cloudflare rejects non-browser user agents** with `error code: 1010` on both
  `api.klaussa.com` and Supabase. Send a browser UA on every call.
- **`auth/sign-in` is rate-limited at 10/minute.** Sign in once, reuse the token
  across all your posts.
- **PDF text layers in this corpus are silently corrupted** — `50.ooo,oo` for
  `50.000,00`, dates as junk glyphs. Verify any number or date taken from a PDF
  against the rendered page image, or cross-check it against a spelled-out
  parenthetical in the same sentence (`0,5% (nol koma lima persen)`), which is
  the more reliable trick.
- **Verify the published page with `?cb=<random>`.** The canonical URL serves a
  24h edge cache, so a correct write looks like a failed one.
- **Finalise content before the first publish.** A post-publish content PATCH
  does not reach the canonical URL for 24h.

---

## 6. Wave 2's legal landscape

Verify all of this yourself; it is orientation, not authority.

- **Land** — UUPA (UU 5/1960), PP 18/2021, PP 24/1997 on pendaftaran tanah, and
  the ATR/BPN Permen layer. Electronic certificates are recent: find the current
  Permen ATR/BPN rather than assuming.
- **Tax procedure** — UU KUP (UU 6/1983 as amended, most recently through UU
  7/2021 HPP and UU 6/2023), plus **PMK 111/2025 on Pengawasan Kepatuhan Wajib
  Pajak**, which is confirmed real and current.
- **Environment** — UU 32/2009 PPLH as amended by UU 6/2023, PP 22/2021, and
  **PP 28/2025** for the licensing interface. **PP 5/2021 is REPEALED** —
  revoked by PP 28/2025 on 5 June 2025 (Pasal 550 huruf b jo. Pasal 552).
  Article numbers do not carry over. This error is live on our own site twice.

Useful corpus doc ids: UU 6/2023 = **384** · PP 28/2025 = **784** ·
UU 1/2022 = **535** · PP 35/2023 = **1087** · UU 23/2014 = **393** ·
UU 12/2011 = **287** · KUHPerdata = **999001** (markdown 404s; use `pdf/`).

---

## 7. Report

Per post: `blog_id`, slug, live URL, cache-busted HTTP status, word count,
internal links used, **every legal citation with the article and which source
tier you verified it against**, and anything you left out with the reason.

Then one line on the cluster: which posts link to which.

---

## 8. Added mid-wave — two source traps found in the tax cluster

Both of these nearly produced a published error. They are not hypothetical.

### `title-search`'s `status` field is WRONG and must never be trusted

It reported PMK 39/PMK.03/2018 and PMK 209/PMK.03/2021 as `Berlaku`. Both are
revoked — **PMK 28 Tahun 2026 Pasal 26** repeals that chain, in force 1 May 2026
per Pasal 27. A writer following the status field would have cited a dead
regulation as governing law, which is exactly the PP 5/2021 error in a new place.

**Establish repeal state from the successor's own closing provisions** —
the `Ketentuan Penutup` / `Ketentuan Peralihan` articles at the end of the
newest instrument in the area, which enumerate what they revoke. Read those
articles before you rely on any older regulation. A regulation is live only
when nothing later says otherwise, and the corpus will not tell you.

### Some corpus PDFs are image-only scans

`pdf/69` (UU 7/2021 HPP) returns a scan with no text layer — `pdftotext` gives
0 bytes, which looks like a fetch failure but is not. When that happens, go to
the official JDIH copy: `peraturan.go.id/files/uu<n>-<yyyy>bt.pdf` has a real
text layer. This is a separate failure from the corrupted-glyph problem in §5.

### Ask for the doc_id rather than hunting for it

The single thing that most improved citation density was reading full statutory
text instead of summary pages. If you cannot locate an instrument in the corpus
after two attempts, **say so in your report and name the instrument** rather
than falling back to a summary page — a supplied id is cheap and a
summary-sourced citation is not acceptable under §1.

---

## 9. Added mid-wave — mechanical output defects seen in shipped posts

Citation density is solved. These three slipped through anyway and each reached
a live page before being repaired. Check your own output for all three before
reporting.

1. **Emit headings as Tiptap `heading` nodes, never `###` inside a paragraph.**
   A post shipped with the literal text `### Contoh hitung...` rendered inside a
   `<p>`. Markdown is not interpreted; it displays raw.
2. **Do not put an H1 in `content`.** The template supplies the title. A
   duplicate H1 node is harmless in the renderer but wrong in the document.
3. **When citing an amending regulation, state what it actually changed** — not
   merely which articles it restated. A post claimed PP 24/2016 Pasal I angka 1
   "mengubah Pasal 1 angka 1 dan angka 4"; the instrument in fact deletes angka 7
   and amends angka 9, restating 1 and 4 unchanged. Read the amendment's
   operative verbs.

### The per-mil trap — this one costs the reader money

**PP 128/2015 Pasal 16 renders as `1%x` and `2%o` in corpus text. Those are
`1‰` and `2‰`, not percentages.** A published post stated 1% and overstated the
fee tenfold. The statute's own `Penjelasan` proves the correct reading with a
worked example (Rp10.000.000 → Rp10.000 + Rp50.000 = Rp60.000).

Generalise it: **any rate symbol taken from corpus text is suspect.** Confirm
every rate against a spelled-out parenthetical or a Penjelasan worked example
before you publish a number the reader will act on. This is the §5 corrupted-
glyph problem in its most expensive form.

---

## 10. Added mid-wave — two rules that supersede softer wording above

### Arithmetic cross-check is MANDATORY, not advisory

§5 suggests checking numbers against a spelled-out parenthetical. That is now a
requirement, and it is broader than §5 implies:

**Corruption is not confined to PDFs. It is in `markdown/<doc_id>` too** — the
endpoint §1 calls the primary route. PP 128/2015 Pasal 16 arrives as `1%x` and
`2%o`; those are `1‰` and `2‰`.

**Any rate, formula, or threshold must be verified against a worked example or a
spelled-out form elsewhere in the same instrument, and your report must name
which one confirmed it.** `%` vs `‰` passes every other check in this brief —
correct endpoint, correct article, primary source, no commercial database — and
still ships a figure that is wrong by an order of magnitude. If the instrument
has a `Penjelasan` with worked arithmetic, run that arithmetic yourself before
publishing the rate.

Corollary: a rate that *is* genuine will usually say so in words —
`1 % (satu persen)`. Presence of the spelled-out form is confirmation; absence
is a reason to keep looking, not a reason to publish.

### Count your links on the published page, not in your draft

**Do not report a link count from your source JSON.** One post reported 5
internal links and shipped 4: a markdown-style link inside a Tiptap text node
was silently dropped in conversion. Fetch your own published page and count the
anchors in the rendered HTML.

**Build links as explicit Tiptap `link` marks on text nodes. Never write
markdown link syntax into a text node and post-process it.**

---

## 11. Added mid-wave — amending laws are more dangerous than repealing ones

§8 tells you to establish repeal state from closing provisions. That finds
outright repeals. **It does not find amendments, and amendments are the harder
failure.**

**The corpus serves the ORIGINAL consolidated text under the live doc_id.**
When an omnibus swaps one *huruf* inside one article:

- the statute is not repealed, so nothing in any closing provision names it
- the article number does not change, so your citation still looks right
- `title-search` reports it `Berlaku`, which is true
- `markdown/<doc_id>` returns the **pre-amendment** text, with no marker

A pillar shipped UU 1/2011 Pasal 42 citing **"izin bangunan induk"** — repealed
terminology, now **Persetujuan Bangunan Gedung (PBG)** — and delegation to a
*Peraturan Menteri* that is now a *Peraturan Pemerintah*. Every check in §1
and §8 passed. The text was simply old.

### The check

**Before citing any article of any pre-2023 statute, grep the omnibus for that
statute's name.** `UU 6/2023` is corpus doc **384**. Its amending articles
enumerate, statute by statute, exactly which provisions it rewrites. If your
statute appears there, read the amending article and cite the provision *as
amended*, saying so explicitly — the old text is still widely quoted online,
which is precisely why saying so is worth something.

Apply the same logic to any statute that has a known omnibus or perubahan layer
over it, not only UU 6/2023. **A statute being "live" tells you nothing about
whether the text you are reading is current.**

---

## 12. Added mid-wave — corpus markdown can misalign article headings

§10 covers corrupted *glyphs*. This is corrupted *structure*, and it is worse,
because the output looks perfectly well-formed.

**In `markdown/<doc_id>`, an article's body can be printed BEFORE its own
heading.** In Permen ATR/BPN 3/2023, Pasal 46's body appears under the `BAB IX`
line, above the `Pasal 46` heading — so it reads as the tail of Pasal 45.
A writer citing it attributes the provision to **Pasal 45**. The article number
is wrong by one and nothing about the citation looks suspicious.

This shipped. It was caught only by re-reading the same provision on
`peraturan.go.id` and `bpk.go.id`.

### The check

**For any citation that carries real weight — a repeal, a deadline, a penalty,
a definition the whole post rests on — confirm the article NUMBER against a
second rendering of the same instrument**, not just the text. Official JDIH is
the second rendering; §1's tier ordering still holds for what you may cite, but
tier 2 is legitimate and necessary as a *cross-check* on tier 1.

Cheap tell: if a provision appears immediately after a `BAB` heading, or the
surrounding articles do not run in sequence, stop and verify the numbering.

**Running list of ways corpus text has been wrong this wave** — all of them
passed every source-tier check in §1:

1. glyph corruption — `1%x` for `1‰` (§10)
2. stale consolidated text under a live id — pre-omnibus wording (§11)
3. heading/body misalignment — article number off by one (§12)

The generalisation: **the corpus is the right place to READ law and the wrong
place to take a single unverified fact from.** Anything a reader acts on —
a number, an article, a deadline — needs a second source.
