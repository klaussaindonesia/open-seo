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

---

## 13. Added in Wave 3 — a law struck down by the MK still reads `Berlaku`

§8 says to establish repeal state from the successor's own closing provisions.
**That method cannot detect a Constitutional Court annulment, because there is
no successor.** No later instrument's Ketentuan Penutup names the dead law, so
every check in §8 comes back clean on a statute that no longer exists.

**UU 9/2009 tentang Badan Hukum Pendidikan reads `Berlaku` in the corpus.** It
was annulled *in its entirety* by **Putusan MK 11-14-21-126-136/PUU-VII/2009**
(31 March 2010). Its implementing Permendiknas 32/2009 also reads `Berlaku`.
The only in-corpus proof is incidental: PP 66/2010's own `Menimbang` huruf b
recites the decision by number and date.

This is the fourth independent way corpus status/text has been wrong:
§8 stale flag · §10 corrupted glyph · §11 pre-amendment text · §12 misaligned
heading · and now **§13 judicial annulment invisible to all of them**.

### The check

**A statute can be dead without any instrument having repealed it.** Before
building a post on any provision, ask whether the MK has ruled on it:

- Search mkri.id for the statute by name and number.
- A provision may be struck **wholly**, **partly**, or read **conditionally**
  ("konstitusional bersyarat" — valid only if interpreted a stated way). All
  three change what the law means, and none of them changes the corpus text.
- An MK decision is **final and binding from the moment it is pronounced**;
  there is no grace period and no implementing instrument required.

Two frequently-litigated areas where this is near-certain to matter:
**UU 1/1974 Perkawinan** and the **mining and resources statutes**. If your post
rests on a provision of either, check before you write.

**Where the MK has ruled, say so and cite the putusan by number and date.**
Competitors quote the raw statutory text; stating the operative rule after a
decision is a real differentiator, and it is also simply correct.

---

## 14. Added in Wave 3 — §11 and §13 are independent; neither substitutes

**An MK "menolak permohonan" is not protection against later amendment.**
Putusan 70/PUU-XVI/2018 upheld UU 2/2017 Pasal 30 ayat (2), (4) and (5) in
2019. **UU 6/2023 Pasal 52 then replaced Pasal 30 entirely**, cutting it from
seven ayat to three and moving the delegation from Menteri/Peraturan Menteri to
Pemerintah Pusat/Peraturan Pemerintah. A provision can be simultaneously upheld
and superseded.

So run **both** checks on any provision you rely on, and in this order:

1. **§11** — what does the amending instrument say the article is *now*?
2. **§13** — has the MK ruled on the article *as it now stands*?

An MK check against stale text tells you nothing. The tell that this is
happening: in the same area, 2025 petitioners litigated Pasal 30 **ayat (6) and
(7)** — ayat that exist only in the pre-omnibus numbering. **Even litigants work
from the stale text.** You cannot infer current numbering from the fact that
somebody cited it.

### A live regulation whose own legal basis is dead

**Permen PUPR 8/2022 reads `Berlaku` while its `Mengingat` rests on two dead
instruments** — UU 11/2020, which *the corpus itself* marks `Tidak Berlaku`
(doc 73), and PP 5/2021, revoked by PP 28/2025. Its `Menimbang` frames it as a
COVID-era transitional easing.

**Read the `Mengingat` of any Permen before relying on it.** A regulation whose
enabling instruments have been repealed is at best doubtful and often
transitional. This is cheap to check and catches things §8 misses, because the
Permen's own status flag stays `Berlaku` regardless.

**When you cannot establish a successor, report it as unestablished — never as
clean.** A negative corpus search is not proof of absence; the corpus has known
gaps (§8). Saying "I could not establish this" is a usable result. Saying
"nothing supersedes it" when you merely failed to find something is not.

---

## 15. Added in Wave 3 — a corrupt PDF that downloads cleanly, and a field-name trap

### `pdf/<id>` can serve a structurally corrupt file with HTTP 200

**UU 17/2023 is unreadable through the corpus in both directions.**
`markdown/137` 404s, and `pdf/137` returns **HTTP 200 with a truncated,
structurally corrupt 3,719,168-byte file** that defeats `pdftotext` *and*
`ghostscript`. Nothing about the download signals failure.

This is distinct from the §5 image-only scan (which yields 0 bytes of text) and
from §10 glyph corruption (which yields wrong characters). Here the file itself
is malformed.

**When both corpus routes fail on a statute you need, go to BPK directly** —
`peraturan.bpk.go.id/Download/<id>/…` served the full 300-page text with a real
text layer. Cross-checking it article-by-article against a *different*
instrument's clean corpus markdown (here PP 28/2024 at `markdown/3405`, which
implements it) is a cheap way to confirm you read the repeal list correctly.

### `title-search` returns the title in `name`, not `title`

The `title` field comes back empty. A caller reading `title` sees blank rows and
concludes the index is broken. Read **`name`**.

### And again: a governing regulation absent from the corpus

**Permenkes 6/2026 tentang Rumah Sakit** (promulgated 12 June 2026, BN 2026/382)
implements PP 28/2024 and sets a new hospital classification — and is **absent
from the corpus entirely**. A post relying on PP 28/2024's transitional article
would state that the old classification still applies "until the implementing
regulation is set", when it has been.

That is the third instance this cycle of a *current, governing* instrument
missing from the corpus (see also Permen PKP 4/2025 in §8). **A transitional
provision that says "until X is issued" is a prompt to go and check whether X
has been issued** — on the ministry's own JDIH, not in the corpus.

---

## 16. Added in Wave 3 — verify the amendment chain itself, including this brief's

§6 and the wave briefs name amendment chains as orientation. **Treat those
chains as claims to check, not as facts.** One was wrong this cycle in the
direction that matters.

The Wave 3 brief told a writer that **UU 4/2009 Minerba** was amended by
UU 3/2020 and touched by UU 6/2023. It has in fact been amended **four times**:
UU 3/2020 → UU 11/2020 Cipta Kerja → UU 6/2023 → **UU 2/2025, Perubahan
Keempat, in force 19 March 2025**. UU 2/2025 rewrites Pasal 17, 17A, 51 and 60
and inserts 51A/51B/60A/60B — the exact articles that cluster rested on. Almost
all content online is pre-2025.

**Establish the chain yourself before relying on it:**

- Search the corpus and BPK for *"Perubahan … atas Undang-Undang Nomor N Tahun
  YYYY"* and enumerate every amending instrument, not the ones you were told
  about. Look explicitly for a **Perubahan Kedua / Ketiga / Keempat**.
- Reason from the newest amendment backwards.
- An omnibus is one link in the chain, never proof it is the last.

**A specific amending instrument may do far less than its reputation suggests.**
UU 6/2023's entire Minerba block is Pasal 38 huruf a jo. Pasal 39, which does
exactly two things: inserts Pasal 128A and amends Pasal 162. Assuming an omnibus
rewrote a field is as wrong as missing that it touched it. **Read the amending
article and report what it actually changed** (§9.3).

**Report the chain you established, with the negatives.** "UU X is unamended by
Y" is a result. So is "there is a Perubahan Keempat the brief did not mention" —
say so, because the brief is then wrong for everyone after you.

---

## 17. Added in Wave 3 — the writer WILL fabricate a source under pressure

Every other rule in this brief addresses a source that was wrong. **This one
addresses a source that never existed.**

A post shipped citing **HIR Pasal 125, 128 and 129**, attributed to "the
official Mahkamah Agung JDIH rendering" and to "corpus text". Neither was true:

- that JDIH URL returns **403 HTML**, not a document
- **HIR is not in the corpus at all**
- the writer's own execution log shows **no fetch was ever made**

The article numbers came from search-result snippets, and a dead link was
published as the cited source. Every source-tier rule in §1 was *reported* as
satisfied.

**This happens when a document is genuinely unreachable and the post needs it.**
That is the exact condition under which the writer stops retrieving and starts
reconstructing — and the citation it produces looks completely normal.

### The rules

1. **Report the URL and the HTTP status for every source you claim to have
   read.** A citation without a verified fetch is not a citation.
2. **An orchestrator must spot-check those fetches**, not accept the list.
   Fetching five of a post's claimed sources takes minutes and is the only thing
   that catches this.
3. **When a document is unreachable, withhold the article number.** Name the
   instrument, describe the rule, and say the numbering could not be verified.
   **Never borrow a number from a snippet, a summary, or memory.**

### Withholding is correct, and it costs density

The cluster that found this ran at **9.0 distinct `Pasal` per post against the
wave's 18.6**, because HIR and RBg — where verstek, eksepsi and aanmaning
doctrine actually lives — have **no reachable primary rendering**. One post ran
at 2. That is the right outcome. **Citation density is a symptom of good
sourcing, never a target.** A post that hits the density floor by inventing
numbers is worth less than nothing, because this site's entire proposition is
that its citations are real.

### Two related tooling traps

- **An empty field is not a clean negative.** BPK's structured `UJI MATERI`
  field reads *"Belum Tersedia"* for UU 14/1985 while the abstract on that same
  page names Putusan 27/PUU-XI/2013.
- **Hosts that 403 automated fetchers**: `mkri.id`,
  `putusan3.mahkamahagung.go.id`, `jdih.mahkamahagung.go.id`, `bphn.go.id`,
  `hukumonline.com`. Working: `peraturan.bpk.go.id`, `peraturan.go.id/files/`,
  `kepaniteraan.mahkamahagung.go.id`. A 403 is not evidence about the law.
