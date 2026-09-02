# Codex writer brief — new cycle, Wave 3

**Read `/home/ez/.claude/jobs/285425d6/tmp/CODEX_W2_BRIEF.md` in full first.**
Despite its name it is the current writer standard, and every one of its 12
sections is binding here. It in turn points at `BRIEF.md` for voice, Tiptap
format, tags, credentials and publish procedure. This file adds only what is
specific to Wave 3.

Wave 2 shipped 18 posts under that brief at a mean of 18.6 distinct `Pasal`
references per post, against 2 for the unguided baseline. **Citation density is
solved. Do not treat it as the goal.** Every serious error in Wave 2 came from
the corpus being wrong while every source-tier check passed — see §8, §10, §11
and §12, which exist because of four separate live-page errors.

---

## 1. Wave 3 is different from Waves 1-2 in one important way

Waves 1-2 were business and land law: a wrong figure cost the reader money.
**Wave 3 includes family law and court procedure, where a wrong deadline or a
wrong forum costs the reader a right they cannot recover** — a missed 14-day
kasasi window, a petition filed in the wrong court, a divorce claim missing a
required element.

Two consequences, and they are not optional:

- **Every deadline, every forum, and every required element gets an article-level
  citation.** If you cannot source it, say so explicitly rather than stating it.
- **Write for a reader deciding what to do, not one being advised.** Explain what
  the law requires and what the procedure is. Do not tell an individual reader
  what they should do in their own case, and do not imply a template removes the
  need for their own judgement. Where an outcome genuinely turns on a judge's
  discretion or on local court practice, say that plainly — it is true, it is
  useful, and pretending otherwise is how these posts become wrong.

**Costs in this wave vary by court and by year.** Panjar perkara is set per
pengadilan by SK Ketua Pengadilan, not nationally. State the *components* and
their legal basis, explain that the amount is set locally and how to find the
current figure for a specific court, and do not publish a single national rupiah
number as though it were the law.

---

## 2. The amendment layer — §11 applies hard across this wave

Every Wave 3 cluster sits on a statute that has been amended, several by
omnibus. **§11: the corpus serves the ORIGINAL consolidated text under a live
doc_id, and `title-search` reports the parent as `Berlaku` throughout.** Grep
the amending instrument before citing any article of a parent statute.

Known amendment layers per cluster — verify each yourself, this is orientation:

- **Family** — UU 1/1974 Perkawinan is amended by **UU 16/2019** (marriage age
  to 19 for both parties; this is the single most-often-stale fact in Indonesian
  family-law content online). KHI is Inpres 1/1991. Peradilan Agama is UU 7/1989
  as amended by **UU 3/2006 and UU 50/2009**. Dispensasi nikah procedure is
  **Perma 5/2019**.
- **Court procedure** — HIR (Java/Madura) and RBg (outside) are the civil
  procedure sources, and *which one applies depends on where the case is*. Say
  so; most writing online cites HIR as if it were national. Mahkamah Agung is
  UU 14/1985 as amended by **UU 5/2004 and UU 3/2009**. E-court is a **Perma**
  layer — find the current one rather than assuming.
- **Health** — **UU 17/2023 Kesehatan is an omnibus that repealed UU 36/2009,
  UU 44/2009 (Rumah Sakit), UU 29/2004 (Praktik Kedokteran), UU 36/2014 (Nakes)
  and more.** Anything citing those as live law is wrong. Its implementing
  regulation is **PP 28/2024**. STR becoming seumur hidup is a UU 17/2023 change
  and is the whole point of that post — get the article right.
- **Mining** — UU 4/2009 Minerba amended by **UU 3/2020**, and touched again by
  UU 6/2023. RKAB mechanics live in the Permen ESDM layer, not the UU.
- **Construction** — UU 2/2017 Jasa Konstruksi amended by **UU 6/2023**; PP
  22/2020 amended by **PP 14/2021**. SBU/SKK sit in the Permen PUPR and LPJK
  layer, which has moved more than once.
- **Yayasan** — UU 16/2001 amended by **UU 28/2004**; PP 63/2008 amended by
  PP 2/2013. The education overlay is UU 20/2003 Sisdiknas plus **PP 57/2021 as
  amended by PP 4/2022**.

**A ministry reorganisation is a repeal tell.** Wave 2 found a Permen reading
`Berlaku` whose repealing successor was absent from the corpus entirely, because
the ministry had been reorganised. Health, construction and education have all
had portfolio changes. When a Permen's issuing ministry no longer exists in that
form, check the successor ministry's JDIH directly.

---

## 3. SERP-check before drafting where intent may split

Three Wave 3 keywords were flagged in the plan as possibly not carrying legal
intent. **Check the live SERP first and write to the legal slice, or report that
the keyword is not ours:**

- **`rekam medis` (6,600/mo)** — may be dominated by EMR software vendors rather
  than the legal obligation. Explicitly flagged as unchecked in the plan.
- **`sbu konstruksi` (1,600/mo)** — reads navigational (people looking for
  LPJK/OSS). The commercial variant `sertifikat badan usaha konstruksi` is the
  real pillar target.
- **`galian c` (2,900/mo)** — colloquial rather than statutory. The legal term is
  batuan; explain the mapping rather than pretending "galian C" is a live legal
  category, and be accurate about what the current statute actually calls it.

Reporting that a keyword is not worth a post is a correct outcome, as §4 says.

---

## 4. One constraint carried from the plan

**`rekam medis` is framed strictly as a compliance obligation for facilities** —
retention periods, access rights, transfer duties under UU 27/2022 PDP and
Permenkes 24/2022. **No offence, prosecution, breach-as-crime, or data-leak
angle.** This wave contains no post about online offences and none should
acquire one.

---

## 5. Report

As §7 of the W2 brief, plus, for this wave specifically:

- for every deadline you publish: the article, and which rendering of the source
  you confirmed the article NUMBER against (§12)
- for every cost: whether the figure is national or set per-court, and the basis
- which parent statutes you cleared against their amending instruments (§11),
  **including the negatives** — a clean check is a result worth recording
- anything you declined to publish, and why
