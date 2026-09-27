# Question Bank Manager & Paper Generator

A production-ready web application for a coaching institute (built for **CUBUS** — NEET · IIT-JEE · Foundation) to store, tag, search, and generate examination papers from a centralized question bank.

This is a real, working application: a Next.js/TypeScript frontend and API, a normalized PostgreSQL schema (via Prisma), Supabase Auth for authentication, Supabase Storage for question images, and server-rendered PDF/print export. It is not a mockup — every button described below calls a real, permission-checked, transactional API route.

## Role model: 1 Owner + Users

This deployment uses a deliberately simple structure instead of a large permission matrix:

- **Owner** (`ADMIN` internally) — exactly one account, full control: manage users, questions, tags, papers, and system settings; can delete questions and view audit logs.
- **User** (`EDITOR` internally) — every other account (8+ of them). Standard working access: add/upload questions, edit tags, generate and edit papers. Cannot manage other users, change system settings, permanently delete questions, or view audit logs.
- **Viewer** (`VIEWER` internally) — an optional, stricter read-only tier the Owner can assign from the Users screen if ever needed (search/view questions, generate papers if permitted). Not used by default — new sign-ups become standard Users.

The seed script (`npm run db:seed`) creates exactly this shape: **1 Owner + 8 Users = 9 accounts**, satisfying the "at least 9 concurrent users" requirement out of the box. See [Demo accounts](#demo-accounts) below.

Permissions are enforced **server-side only** (`src/lib/auth.ts` → `requireRole`) — the UI hides buttons a role can't use, but every API route independently re-checks the role from the authenticated session, never from anything the client sends.

**The Owner can add users directly.** The Users screen has a "+ Add User" button (`POST /api/users`, ADMIN-only) that creates a brand-new account immediately — email, name, password, and role chosen up front — instead of only being able to promote/demote someone who has already self-registered at `/register`. It reuses the existing Supabase service-role admin client and the `handle_new_auth_user` database trigger that already auto-creates the matching `profiles` row, so there's no duplicate account-creation logic. If `SUPABASE_SERVICE_ROLE_KEY` isn't configured in a given deployment, the endpoint fails gracefully with a clear message pointing back to `/register` rather than a raw error. Self-registration at `/register` still works exactly as before for anyone who prefers it.

## Tech stack (and why)

| Layer | Choice | Why |
|---|---|---|
| Frontend/Backend | Next.js 14 (App Router) + TypeScript, strict mode | One framework for UI, API routes, and server components; strong typing end-to-end |
| Styling | Tailwind CSS | Fast, consistent, no unused-CSS bloat |
| Database | PostgreSQL via Prisma ORM | Prisma migrations give reviewable, versioned schema changes; strong typing of every query |
| Auth | Supabase Auth | Managed password hashing, session cookies, email confirmation — no hand-rolled auth |
| File storage | Supabase Storage (private bucket) | Images stored as-is, served via short-lived signed URLs, access-controlled at the DB level via storage policies |
| Math rendering | KaTeX (in-app) + MathJax (print/PDF) | KaTeX is fast for live editing previews; MathJax handles a broader range of LaTeX reliably for the final print/PDF output |
| PDF export | Puppeteer (`puppeteer-core` + `@sparticuz/chromium`) rendering the same HTML used for Print | One rendering path for both "Print" and "Download PDF" — what you preview is exactly what you get. Falls back gracefully: every paper is ALSO printable straight from the browser (Ctrl/Cmd+P → Save as PDF) if the server PDF pipeline is ever unavailable, so PDF export is never a single point of failure |
| CSV import | Papaparse | Battle-tested CSV parsing, handles quoted/multiline fields correctly |
| PDF question import | `pdf-parse` + a custom numbering-pattern splitter | See [PDF import](#pdf-question-import) below — this is a heuristic, human-reviewed feature, not magic OCR |

## Business rules implemented

Every rule from the specification is enforced in code, not just documented:

1. **Original questions are never auto-modified.** Content lives in `question_versions`, an append-only table. No code path rewrites, "corrects", or reformats question text — the only way content changes is a human explicitly using "Edit content manually," which creates a *new version* (`src/app/api/questions/[id]/content/route.ts`).
2. **Tags are independent of content.** `PATCH /api/questions/:id/tags` never touches `question_versions`; `PATCH /api/questions/:id/content` never touches subject/class/code/difficulty.
3. **Generated papers never modify the question bank.** Paper generation only *reads* questions and writes to `papers`/`paper_questions`/`paper_versions`.
4. **Papers preserve the exact question version used.** `paper_questions.questionVersionId` pins a specific version; `paper_versions.snapshot` additionally embeds the full rendered content, so a paper stays reproducible even if the question is edited or archived afterwards.
5. **Duplicates are never silently added.** `src/lib/duplicate-detection.ts` runs an exact-hash + token-overlap similarity check on every create and CSV/PDF import row, surfacing a warning the user must explicitly confirm past.
6. **Insufficient questions are clearly reported.** `src/lib/paper-generation.ts` computes exact shortfalls per filter line (e.g. *"Only 8 difficult Physics questions are available for 11 JEE Code A. You requested 12."*) and blocks generation rather than silently returning fewer questions.
7. **9+ simultaneous users.** Stateless API routes + a pooled Postgres connection (via Supabase's pgbouncer transaction pooler) mean concurrency is bounded by the database, not the app server. Seed data provisions exactly 9 demo accounts.
8. **Server-side permission enforcement.** See [Role model](#role-model-1-owner--users) above.
9. **Historical papers stay stable.** See rule 4.
10. **Bulk operations are transactional.** CSV/PDF confirm-import and paper generation each run inside a single `prisma.$transaction` — a bad row rolls back the whole batch, never a partial write.
11. **Data lives in a real online database**, never `localStorage`.
12. **Backups.** See [Backup & Recovery](#backup--recovery).
13. **Pagination everywhere.** The question list, paper list, and audit log all page server-side (max 100 rows/request) — the browser never receives the whole bank.
14. **No silent failures.** `src/lib/api-error.ts` centralizes error → HTTP response translation; every mutating UI action shows a success or a specific failure toast, never a bare "done" when the server call actually failed.
15. **Optimistic locking.** `questions.rowVersion` / `papers.rowVersion` are checked on every update; a stale write gets a 409 with a clear "reload to see the latest version" message instead of overwriting someone else's change (`src/lib/api-error.ts` → `ConflictError`).

## Advanced Paper Builder

`Create Paper → Advanced Paper Builder` tab (alongside, not replacing, the original single-list Quick Generator) builds a fully custom, multi-section paper:

- **Multi-type, multi-section papers.** A paper is any number of sections (`paper_sections`), each with its own label, title, instructions, and one or more question types (MCQ / Subjective / Integer, `questions.question_type`) with independent counts, marks-per-question, and difficulty — never forced into one type or a fixed "Section A/B/C" naming.
- **Chapter/Topic scoping.** `chapters` (per Subject) and `topics` (per Chapter) — seeded with a realistic starter set (`src/lib/constants.ts` → `CHAPTERS_SEED`) — let a section restrict its candidate pool to specific chapters/topics, or "All".
- **Three selection modes.** Automatic (server picks by chapter/topic/type/count/difficulty, same dedup/shuffle engine as the Quick Generator — `selectSectionedQuestions` in `src/lib/paper-generation.ts`), Manual (pick every question from the Question Bank directly, order = paper order), Hybrid (auto-fill, then swap individual questions).
- **Never silently substitutes.** A shortfall is reported per section/type with the exact wording *"You requested 5 Integer questions from Chapter 3, but only 3 matching questions are available."* (`SectionedInsufficientQuestionsError`); missing MCQ options, invalid Integer answers, missing marks, and duplicate question picks are all caught before a paper is created (`PaperValidationError`), and generation only proceeds once every question is valid.
- **Configurable numbering & marks display**, applied consistently by the renderer: `1,2,3` / `Q1,Q2,Q3` / `1(a),1(b),1(c)` numbering (per-section continue-or-restart), and `[2 Marks]` / `(2)` / `[2]` marks display (Paper Settings panel).
- **Subjective answer space** (None/Small/Medium/Large/Custom mm) renders as a real block-level reserved area, so it can never overlap the next question.
- **Column layout stays consistent** — section headings break out to a genuine full-width band (CSS `column-span: all`) inside a multi-column body rather than faking it with manual spacing, matching the same 1-or-2-column setting used everywhere else in the paper.
- **Custom title/subtitle.** `papers.subtitle` + `papers.heading_config` (JSON) capture the custom heading configuration; the cover page renders the subtitle when set. (Granular per-field show/hide rendering of the full heading editor — school name/exam/roll number/etc. — is captured and persisted in `heading_config` but not yet fully wired into the PDF/DOCX renderer's field-by-field visibility; the discrete fields it already renders — institute, exam, subject, class, date, time, marks — come from the paper's existing columns exactly as before.)
- Exports identically through the existing PDF/DOCX/CSV pipeline and the Download Menu — a section-based paper is a normal `Paper` row with `PaperSection`/`PaperQuestion.sectionId` rows underneath, so nothing else about viewing, editing, printing, or exporting a paper changes.
- **Live running totals while building.** Each section's "Question selection" panel shows a real-time `Total in this section: N question(s) · M mark(s)` as types/counts/picks change, and the Sections card and the Generate button both show the paper-wide grand total — so the exact final question count and mark total are visible before you generate, not just after.

## Question creation & tagging

`Question Bank → Add Question` follows one fixed field order — **1. Add Question, 2. Subject, 3. Class/Exam, 4. Chapter Name, 5. Topic Name, 6. Code, 7. Difficulty, 8. Question No** (`src/components/questions/QuestionForm.tsx`) — never reordered.

- **Chapter and Topic are free-typing fields, not a dropdown-plus-button.** (`src/components/ui/CreatableSelect.tsx`) Type a name; matching existing entries suggest as you type, and committing (Enter, clicking a suggestion, or clicking away) either selects an existing case-insensitive match or creates a brand-new Chapter/Topic on the spot — no separate "+ Create" step. Chapter depends on Subject; Topic depends on Chapter — changing Subject clears Chapter+Topic, changing Chapter clears Topic. Typing the same new name twice within one form session resolves to the same entity rather than creating a duplicate.
- **Chapters/Topics have a persistent order.** `Settings → Chapters & topics` (`src/components/settings/ChapterTopicManager.tsx`) manages both, each reorderable via native drag-and-drop or Up/Down buttons — the order is saved to `chapters.sort_order`/`topics.sort_order` and drives their display order everywhere else (Question form, Question filters, Paper Builder).
- **Three question types**, each with distinct fields: MCQ (Options A–D + Correct Answer), Subjective (Expected Answer + **Marking Scheme**, `question_versions.marking_scheme`), Integer (a single numeric answer, validated against `INTEGER_ANSWER_PATTERN = /^-?\d+$/` — whole numbers only, e.g. `0`, `5`, `12`, `-4`; decimals are rejected both client- and server-side). **Expected Answer/Marking Scheme are never rendered on the student paper** — same internal-only rule as `explanation`.
- **MCQ options can each carry their own image**, not just a general question-level image — an option can be a diagram/figure in its own right (`question_images.option_slot`, one of `A`/`B`/`C`/`D`, `null` for a general question image). Attach it right under that option's text field in Add Question / Question edit; it uploads through the same `POST /api/questions/images` endpoint (with an `optionSlot` field) and is stored/attached exactly like any other question image, so it flows unchanged through CSV/PDF/Handwritten import (which attach by image id) and both paper renderers — `src/lib/pdf/paperHtml.ts` and `src/lib/docx/paperDocx.ts` render it inline with that option, capped to a smaller width since it illustrates one choice rather than the whole question.
- **Rapid Question Entry.** Individual "Keep Subject / Keep Class-Exam / Keep Chapter / Keep Topic" checkboxes control exactly which tags survive "+ Add Another Question" — Code/Difficulty/Question No. are always cleared for the next entry (a paper-set code rarely repeats question-to-question).
- **Question number auto-generation.** "Auto-generate" (`GET /api/questions/suggest-number`) proposes `SUBJ CLASS-CHAPTER-DIFF-###` from the currently selected tags — always editable, never forced.
- **Duplicate question numbers get a soft warning** (not a hard block), the same confirm-to-proceed pattern already used for duplicate question text.

## Brand identity

The CUBUS brand color (`#400c4d`) and the CUBUS logo are used consistently in two separate places, kept intentionally distinct:

- **Generated papers** (`src/lib/pdf/paperHtml.ts`, `src/lib/docx/paperDocx.ts`) — `#400c4d` is the heading/rule/accent color in the PDF, HTML print view, and DOCX export, and the supplied CUBUS logo renders as the page watermark on every page of every paper (`src/lib/pdf/brandAssets.ts` → `CUBUS_WATERMARK_LOGO_DATA_URI`). The existing header-band icon and cover-page logo were left as they were — only the watermark was changed, as requested.
- **The application UI itself** — `tailwind.config.ts`'s `brand` color scale (buttons, focus rings, links, badges, tabs — everything in the app chrome) is generated from the same `#400c4d`, with shade `900` set to the exact brand hex and the rest of the 50–950 scale tapered from it, so the question bank manager's own interface and the papers it produces share one consistent theme.

## PDF question import

`Question Bank → Bulk Upload → PDF Import` extracts text from an uploaded PDF (`pdf-parse`) and splits it into individual questions using a numbering-pattern heuristic (`src/lib/pdf/extractQuestions.ts`): it looks for lines starting with `1.`, `Q1.`, `Q.1`, etc., and options starting with `A)`, `(A)`, `A.`, etc.

This is a **best-effort assistant, not OCR magic**:

- Works well on text-based PDFs with clear, consistent numbering.
- **Scanned/image-only PDFs have no extractable text** and will report zero questions — run them through an OCR tool first (e.g. as a preprocessing step), or re-type them, or use CSV import instead.
- Equations rendered as embedded images inside the PDF won't appear as text — re-attach them as question images after import if needed.
- **Nothing is ever saved automatically.** Every detected block is shown in an editable review list — merge/split/edit text, assign tags — before the same transactional, duplicate-checked confirm step used by CSV import commits anything.

## Handwritten PDF Import

`Question Bank → Bulk Upload → Handwritten PDF` converts a photo/scan of a **handwritten** question paper (PDF, PNG, or JPG/JPEG) into clean, professional digital questions — full recognition, not the plain-text extraction the typed-PDF importer above uses, since handwriting has no extractable text layer at all.

**Pipeline** (`src/lib/pdf/handwritingPipeline.ts`, run fire-and-forget from the upload route — see "Why async without a queue" below):

1. **Upload & validate** (`POST /api/questions/bulk-import/handwritten/upload`) — rejects unsupported file types, empty files, oversized files (25 MB cap), and distinguishes a corrupt PDF from a password-protected one with a specific message for each (`pdf-lib`'s `PDFDocument.load(buf, {ignoreEncryption:false})`, checked *before* anything is stored). A standalone PNG/JPG is wrapped into a one-page PDF server-side so the rest of the pipeline only has one code path. The original upload is stored untouched in Supabase Storage and **never deleted or overwritten**, even after a successful import.
2. **Detect pages** — reuses the existing `extractPdfText` page-count logic.
3. **Read handwriting** (`src/lib/pdf/extractHandwrittenAI.ts`) — sends the PDF to Claude with a system prompt that is explicit about the anti-hallucination contract: transcribe exactly what's legible (math as LaTeX), never solve/rewrite/"improve" the question, never invent illegible content — genuinely unclear text is transcribed as a best guess but flagged `confidence: LOW` / `needsReview: true` with a specific reason. Every question and every diagram carries its own confidence + review flag; nothing is ever presented as certain when it isn't.
4. **Detect & reconstruct diagrams** — for each diagram, Claude reports a *bounded, checkable* list of geometric primitives (lines/circles/polygons/text labels, in a fixed 0–1000×0–1000 coordinate space) rather than generating pixels directly. A separate, fully deterministic renderer (`src/lib/pdf/diagramSvgRenderer.ts`) then draws exactly those primitives as clean vector SVG — so the actual drawing step is provably non-hallucinated code; only the *shape list* is AI-derived, and that step is bounded and confidence-scored. The original page region is also cropped out (`sharp`) as a genuine "as handwritten" comparison image, reusing the existing `extractDiagramsFromPdf` (poppler `pdfimages`) page-extraction logic.
5. **Create questions** — extracted questions are staged in the `ImportJob.resultJson` for review; nothing touches the Question Bank yet.
6. **Review screen** (`src/components/upload/HandwrittenPdfImportWizard.tsx`) — every question shows a confidence badge (High/Medium/⚠ Needs review, with the specific reason inline) and expands to the **exact same 8-step tagging fields** as manual entry (Subject → Class/Exam → Chapter → Topic → Code → Difficulty → Question No.), plus the same type-conditional content fields (MCQ/Subjective/Integer) as `QuestionForm`. Every diagram shows **Original vs. Generated side by side** with **Accept generated / Use original / Edit / Regenerate** controls — the user has the final decision, and the original crop is retained regardless of which is chosen.
   - **Regenerate** (`POST .../diagram/[key]/regenerate`) re-runs recognition on just that diagram's original cropped region (never the whole document) via a focused Claude vision call, in case the first pass missed the geometry.
   - **Edit** opens the raw SVG markup for hand-correction; the edited version is what gets saved if "Accept generated" is the final choice.
7. **Confirm & save** (`POST .../confirm`) — persists reviewed rows as real `Question` + `QuestionVersion` rows through the **same creation path and the same database** as manual entry and CSV import (no separate/incompatible system). Every tag FK is re-validated server-side (client selections are never trusted), runs inside one transaction, and the chosen diagram artwork (generated SVG / hand-edited SVG / original crop) is uploaded as a real `QuestionImage` attached to the new version — so diagrams automatically flow into the Paper Generator exactly like any manually-attached image. The source `ImportJob` is marked `confirmedAt`/`confirmedQuestionCount` so it can't be double-imported, while `resultJson` and the original file stay intact and inspectable.

**AI/OCR provider abstraction** (Part 20 of the spec — "do not hard-code a single AI provider"): `src/lib/ai/ocrProvider.ts` defines the `OCRProvider` interface (`isConfigured()`, `extractHandwriting()`) and the shared types (`DiagramShape`, `ExtractedDiagram`, `ExtractedHandwrittenQuestion`). Exactly one implementation exists today (Claude/Anthropic, reusing the same `ANTHROPIC_API_KEY`/SDK pattern as the typed-PDF importer's AI mode), selected via `AI_PROVIDER` (defaults to `anthropic`) — see `.env.example`. If it's unconfigured, upload still succeeds but processing fails with a clear, specific error (`ImportJob.status = FAILED`, `errorMessage` set) — never a mocked/fake result.

**Why async without a queue.** This codebase has no job-queue/worker system, and this app runs as a **persistent Node server** on Render (`next start -p $PORT`), not ephemeral serverless — so the upload route creates the `ImportJob` row and calls `void processHandwrittenImportJob(job.id)` **without awaiting it**, returning `{jobId}` (202) immediately; the browser polls `GET .../handwritten/[jobId]` and shows the pipeline's own discrete stage messages ("Uploading…", "Reading handwriting…", "Detecting diagrams…", "Generating professional diagrams…", "Creating questions…", "Ready for review."). This fire-and-forget pattern is explicitly **not** safe on ephemeral/serverless platforms (the process can be frozen or recycled between requests) — see the code comments in `handwritingPipeline.ts` and `upload/route.ts`.

**Error handling** — every documented failure mode returns a specific, actionable message rather than a generic failure: unsupported file type, empty file, oversized file, corrupt PDF, password-protected PDF, an AI/OCR service call failure or timeout, and a max-output-length response ("split into smaller files"). Nothing is ever silently discarded — a failed job keeps its original file and reports why it failed.

**Security** — the same `requireRole(PERMISSIONS.QUESTION_BULK_IMPORT)` (Owner/User) gate as CSV/PDF import; an `ImportJob` is only visible/actionable by its creator or an Owner; every tag ID is re-validated against the live lookup tables at confirm time regardless of what the review screen sent; uploads are validated server-side (MIME type, size, PDF structure) before anything is stored.

## Cover Page Designer

`Paper → Design Cover Page` (`/papers/:id/cover`) is a visual, drag-and-drop front-page/cover-page editor layered on top of the original hardcoded cover — a purely additive extension that never removes or changes any existing paper-generation, tagging, export, or OCR functionality. A paper with no custom cover design renders **exactly** as it always has (enforced by a regression test — see Testing below).

**Data model** (`src/lib/validation/coverDesign.ts`) — a `CoverDesign` is `{ pageSize, orientation, background, elements[], settings }`, stored as JSON on `Paper.coverDesign` (nullable — `null` for every paper that predates this feature) and, identically, on the new standalone `CoverTemplate.design` column (a genuinely separate model from the original flat `PaperTemplate` institute-letterhead picker — the two serve different UIs and are never merged). Every `CoverElement` (text/heading/subheading/logo/image/line/rectangle/divider/instructions/table/customField) carries both its **content** (literal `text`, or a bound `placeholderKey`/`customFieldKey`) and its **styling** (position/size in millimetres, font family — restricted to `Calibri/Arial/Times New Roman/Georgia/Verdana/Helvetica/Courier New/Trebuchet MS` — size/weight/style/alignment/color/border) on the same object, so both are independently editable as the spec requires. `Paper.separateFrontPage` (boolean, defaults `true`) preserves the pre-existing implicit "cover is always its own page 1" behavior as an explicit, identically-defaulted toggle.

**Data binding** (`src/lib/pdf/coverPlaceholders.ts`) — an element can bind to a built-in placeholder (`schoolName`, `examName`, `paperTitle`, `subject`, `class`, `academicYear`, `date`, `time`, `maximumMarks`, `instructions`) or a user-defined custom field (`+ Add Custom Field`, e.g. "Academic Session" → "2026–27"), or use plain `{{token}}` substitution inline inside literal text. A bound value always overrides stale literal preview text at render time; an unrecognized `{{token}}` is left visibly as-is rather than silently deleted.

**OCR / design analysis** (`src/lib/ai/coverDesignAnalysis.ts`) — "Upload Reference Image" (PNG/JPG/JPEG/WEBP) + "Analyze Design" sends the image to Claude as a **visual design reference**, not a plain-text OCR pass: the model reports a bounded, checkable list of text blocks / image blocks / shape blocks (fixed 0–1000×0–1000 coordinate space, forced structured tool output — the same anti-hallucination pattern as the Handwritten PDF importer), each carrying a field guess, estimated typography, and `confidence: HIGH/MEDIUM/LOW` + `needsReview`. Nothing is ever silently invented — uncertain text is flagged for review, never guessed silently. Runs as the same fire-and-forget `ImportJob` pattern as the handwritten importer (`kind: COVER_DESIGN_ANALYSIS`, a new value on the existing enum — no parallel job table), polled via `GET /api/papers/cover/analyze/[jobId]`.

- **Use as Template** (`src/lib/pdf/coverDesignConvert.ts`) reconstructs the analysis into REAL, individually editable `CoverElement`s (never a single flat background image) — each one still carrying its OCR confidence/needsReview flag into the designer's review UI.
- **Use as Background** instead keeps the reference image visible at an adjustable opacity (0–100%) as a trace-over guide, leaving the design otherwise empty.

**Canvas editor** (`src/components/papers/cover/CoverDesignerClient.tsx`) — a page-sized (A4/Letter/Legal, matching Paper Settings) canvas with real pointer-based drag/reposition and resize (aspect ratio always preserved for image/logo elements), an Add Element menu, a Properties panel (text/font/size/style/alignment/position/size/colors/opacity), a Layers panel (reorder/hide/lock/bring-to-front/send-to-back/delete), page-relative alignment tools, and optional grid/snap-to-grid (editor-only — never shown in the final PDF/print/DOCX output).

**Rendering integration** — `renderPaperHtml()` (`src/lib/pdf/paperHtml.ts`) takes two new, optional, defaulted trailing parameters (`coverDesign`, `separateFrontPage`); an existing caller that omits them gets byte-identical output to before. When a design with elements is present, `renderDesignedCoverPage()` renders it as absolutely-positioned elements in the same millimetre coordinate space the canvas uses, on its own page (`page-break-after`), before the question content — both the server PDF export and the browser Print view share this one function, so they can never visually disagree. **Word (.docx) export** cannot host freely-overlapping, absolutely-positioned elements the way a page/PDF can, so — per explicit product decision — a designed cover is instead **flattened to a single full-bleed image**: `renderCoverOnlyHtml()` renders a minimal standalone version of the same cover, `renderHtmlToPngBuffer()` (`src/lib/pdf/paperPdf.ts`) screenshots it via the same headless-Chromium pipeline already used for PDF export, and `buildPaperDocxBuffer()` embeds the result as one `ImageRun` on a zero-margin section. Every image/logo path stored in a design is a Supabase Storage **path**, never a signed URL (those expire in 1 hour) — `resolveCoverDesignForRender()` swaps in fresh signed URLs immediately before any render, and the designer's own load endpoint keeps the storage-path design and a separate preview-URL map distinct so an edit session can never accidentally save an expiring URL back into the design.

**Cover Templates** (`GET/POST /api/papers/cover-templates`, `GET/PATCH/DELETE .../[id]`, `POST .../[id]/duplicate`) — Save/Use/Duplicate/Delete a reusable named design, independent of any one paper; duplicating always creates a fully independent copy.

**API surface**: `PATCH /api/papers/:id/cover` (save, optimistic-locked by the paper's existing `rowVersion`, identical pattern to the main Paper save endpoint) · `GET /api/papers/:id/cover` (load) · `POST /api/papers/cover/analyze/upload` + `GET .../[jobId]` + `POST .../[jobId]/convert` (reference-image analysis) · `POST /api/papers/cover/images` (element/logo image upload).

**Known limitations** (disclosed, not silently descoped): the "table" element type is a simplified single bordered text box, not a real row/column grid; historical `PaperVersion` snapshots and the versioned print route do not currently carry a cover-design snapshot — they keep rendering the original hardcoded cover; and font-weight/spacing estimated from a photographed reference is inherently an approximation, not pixel-perfect reconstruction.

## Getting started (local development)

### 1. Prerequisites

- Node.js 18.18+ and npm
- A free [Supabase](https://supabase.com) project (Postgres + Auth + Storage)

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, and `DIRECT_URL` from your Supabase project's **Settings → API** and **Settings → Database** pages. Set `APP_BOOTSTRAP_ADMIN_EMAILS` to the single email address that should become the Owner.

### 4. Set up the database

```bash
npx prisma generate
npx prisma migrate dev --name init
```

This requires outbound network access to `binaries.prisma.sh` to download Prisma's query engine — allow this host if you're behind a restrictive firewall/proxy.

Then, in the Supabase SQL Editor, run (in order):

1. `supabase/sql/001_auth_trigger.sql` — wires new sign-ups to a `profiles` row (update the `bootstrap_owners` array with your Owner's email first).
2. `supabase/sql/002_storage_bucket.sql` — creates the private storage bucket + access policies for question images.
3. `supabase/sql/003_paper_folders_and_settings.sql` — Saved Papers folders + per-paper layout/typography settings (Paper Settings panel).
4. `supabase/sql/004_advanced_paper_builder.sql` — question type/chapter/topic tagging, multi-section papers, custom heading, and numbering/marks-display config (Advanced Paper Builder — see below). Purely additive except swapping the always-unused `paper_questions.section_label` placeholder column for a real `section_id` foreign key.
5. `supabase/sql/005_handwritten_import_and_marking_scheme.sql` — adds `question_versions.marking_scheme` (Subjective-only, internal-only rubric) and the `import_jobs` table (Handwritten PDF Import — see below).
6. `supabase/sql/006_handwritten_import_confirmed.sql` — adds `import_jobs.confirmed_at`/`confirmed_question_count` so a reviewed import can't be double-saved into the Question Bank.
7. `supabase/sql/007_option_images.sql` — adds `question_images.option_slot` (nullable, `A`/`B`/`C`/`D`) so an MCQ image can be attached to a specific option instead of only the question as a whole.

### 5. Seed demo data

```bash
npm run db:seed
```

Creates the lookup tables, 100+ sample questions across realistic tag combinations, a default paper template, and — if your `.env` Supabase credentials are filled in — **1 Owner + 8 User demo accounts**.

#### Demo accounts

| Role | Email | Password |
|---|---|---|
| Owner | `owner@qbank.demo` | `Passw0rd!2026` |
| User | `user1@qbank.demo` … `user8@qbank.demo` | `Passw0rd!2026` |

**Change these passwords (or delete the accounts) before any real deployment.**

### 6. Run the app

```bash
npm run dev
```

Visit `http://localhost:3000`.

## Testing

```bash
npm test          # Vitest unit tests — validation schemas (including chapter/topic
                   # tagging, the handwritten-import row schema, and the Integer
                   # answer format), duplicate detection, PDF question splitting,
                   # the deterministic diagram-shape-to-SVG renderer, paper
                   # HTML/DOCX rendering, paper settings validation, CSV export,
                   # the Advanced Paper Builder's section validation/
                   # numbering/marks-display/answer-space rendering, and the
                   # Cover Page Designer (coverDesignSchema validation,
                   # placeholder/data-binding resolution, "Use as Template"
                   # analysis→CoverElement conversion, the designed-cover HTML
                   # renderer, and a regression test proving renderPaperHtml()'s
                   # output is byte-identical when coverDesign is null)
                   # (135 tests, no DB needed)
npm run typecheck  # TypeScript strict-mode check (requires `npx prisma generate` first)
npm run lint       # ESLint
npm run test:e2e   # Playwright end-to-end smoke test — requires a running,
                   # seeded app (npm run build && npm run start against a
                   # configured .env) — see tests/e2e/full-flow.spec.ts
```

The Final Acceptance Test scenario from the specification (create 100+ questions, tag them, search/filter, generate an exact-count paper, verify no duplicates, export PDF, generate an answer key, confirm the original questions are untouched, exercise concurrent editing/optimistic locking, and verify historical paper stability) is covered by: the seed script (step 1–2), the question list search/filter UI (step 3), the Paper Generator's exact-count + shortfall logic (step 4–6, see `src/lib/paper-generation.ts`), the print/PDF export routes (step 7), the answer key mode (step 8), the append-only `question_versions` table (step 9), the 9 seeded accounts (step 10), the `rowVersion` optimistic-lock conflict handling on both questions and papers (step 11), the centralized error handling that never claims success on failure (step 12), and the `paper_versions` immutable snapshot mechanism (step 13).

> **A note on the Handwritten PDF Import build's own testing.** This feature (chapter/topic management, the question-type/marking-scheme rework, and the full handwriting pipeline) was authored in the same sandboxed environment as the rest of this project, with the same `binaries.prisma.sh` restriction — `npx prisma generate` still fails there (confirmed again this pass: `Failed to fetch sha256 checksum... 403 Forbidden`), so a real `tsc`/`next build` could not be run locally. What was verified: the full Vitest suite (110/110 passing, 22 of which are new — the Integer-answer validator, the chapter/topic Zod schemas, the handwritten-import row schema, and the diagram SVG renderer's shape-to-markup output including coordinate clamping and XML-escaping), a clean `eslint` pass across all of `src/` (0 errors — 8 pre-existing warnings, all `react-hooks/exhaustive-deps` in files unrelated to this change), and `tsc --noEmit` against the same stale pre-generated Prisma client stub as before. Every new error surfaced by that stub check was manually triaged: all fall into the identical pre-existing "stale-stub" category (a `Prisma.InputJsonValue`/`QuestionWhereInput`-style namespace member missing, or an implicit `any` on a value the stub types as `{}`) — the *same* error pattern appears in files this pass never touched (e.g. `src/app/api/folders/[id]/route.ts`, `src/app/api/papers/route.ts`), confirming it's a sandbox-wide, pre-existing limitation rather than anything introduced here. **What was not (and could not be) verified in this sandbox**: an actual live call to the Anthropic API (no network egress to `api.anthropic.com` here, and no key was shared with this session by design — the user set `ANTHROPIC_API_KEY` directly in Render), so the handwriting/diagram-extraction prompts and the JSON-schema-constrained tool-use contract are correct *by construction and by matching the already-proven typed-PDF importer's pattern*, but the end-to-end "upload a real handwritten photo and get a good result" path has not been exercised against a live model. Verify this in production with one real handwritten test paper before relying on it for a class set.
>
> **A note on this build's own testing.** In the sandboxed environment this project was authored in, outbound network access to Prisma's engine-binary host (`binaries.prisma.sh`) was blocked, so `npx prisma generate` — and therefore a full `tsc`/`next build` — could not be run there. What **was** verified in that environment: a clean `npm install`, the full Vitest suite (88/88 passing) covering the pure-logic modules, and a clean `eslint` pass (0 errors) across the entire `src/` tree. `tsc --noEmit` was still run against the stale pre-generated Prisma client already present in `node_modules/.prisma` (which predates several models, including `PaperSettings`, `Chapter`/`Topic`, and `PaperSection`) as a best-effort check for everything *not* Prisma-shaped — every remaining error was manually inspected and falls into the same pre-existing "stale-stub" category (a Prisma namespace member missing, or an implicit `any` on a value the stub types as `{}`/`any`), matching the identical error pattern already present in untouched files; zero errors of any other kind were introduced. Schema field/relation names used throughout the new API routes (`Chapter`/`Topic`/`PaperSection`/the new `Question`/`Paper`/`PaperSettings` fields) were manually cross-checked against `prisma/schema.prisma` and the matching `supabase/sql/004_advanced_paper_builder.sql` migration. The section-aware PDF renderer (`src/lib/pdf/paperHtml.ts`) was exercised against a real headless Chromium binary in that sandbox with a 3-question, 2-section (MCQ + Subjective, RESTART numbering, LARGE answer space) test paper and its output visually verified (rendered to PNG via `pdftoppm`) — confirmed: correct per-section numbering restart, `[N Marks]` display, a full-width section-heading band inside the two-column body, a non-overlapping reserved answer-space box, the new `#400c4d` brand color throughout, and the new logo rendering as the page watermark. The app's own UI theme (`tailwind.config.ts`'s `brand` scale, now generated from `#400c4d`) was checked by grepping for any leftover hardcoded references to the old blue palette across `src/` (none found — every usage runs through the Tailwind `brand-*` classes) and by re-running the full test suite and lint after the change. The DOCX exporter (`src/lib/docx/paperDocx.ts`) was structurally verified (unzipping the `.docx` output and checking for well-formed OOXML) via its Vitest suite — not just "the function didn't throw". Run `npx prisma generate && npm run typecheck && npm run build` in your own environment (which will have normal internet access) as the first verification step before deploying.

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for step-by-step Vercel + Supabase deployment instructions, environment variable reference, and production checklist.

## Backup & Recovery

- **Database**: Supabase Postgres projects take automated daily backups (Point-in-Time Recovery is available on paid tiers) — enable this in **Supabase → Database → Backups**. For an extra layer, schedule `pg_dump $DIRECT_URL > backup.sql` via a cron job / CI schedule and store the output in a separate object store (e.g. a private S3 bucket) not co-located with the primary database.
- **Files/images**: Supabase Storage buckets can be mirrored with `rclone` or the Supabase CLI (`supabase storage cp -r`) to a second bucket/provider on a schedule.
- **Data export**: Admins can export the full active question bank as CSV at any time from **Question Bank → Export CSV** (`GET /api/questions/export`) — this is also a fast way to get data out for a manual backup or migration.
- **Dashboard/Reports break the question bank down by every tag** — Subject, Class/Exam, Chapter, Topic, Code, Difficulty, and Question Type (`src/lib/dashboard-stats.ts`). The Dashboard's compact widgets cap Chapter/Topic to the top 10 by question count (with a "+N more — see Reports" note when there's more), since those two can run to dozens of entries unlike the small fixed lookup tables; **Reports** (`/reports`) always shows the complete, uncapped breakdown for every tag as a table with percentages.
- **Difficulty Level Breakdown** (Dashboard and Reports) goes a level deeper than a plain count: for each difficulty it shows the question count, what percent of the active bank that is, how many of those questions have been pulled into at least one generated paper (any `PaperQuestion` row referencing them), and what percent of that difficulty's own pool that represents — e.g. "Medium: 340 questions, 42% of the bank · 120 used in papers, 35% utilized." A difficulty level with zero questions still appears as 0/0% rather than silently disappearing.
- **Recovery procedure**: restore the Postgres backup to a fresh Supabase project (or the same project's PITR), re-point `DATABASE_URL`/`DIRECT_URL`, re-run `supabase/sql/*.sql` if it's a fresh project, redeploy the app. Because `question_versions` and `paper_versions` are append-only, a restore to any prior point in time still yields a fully consistent, reproducible history.
- **Single point of failure**: none by design — the database is Supabase-managed (replicated), file storage is Supabase-managed (replicated), and the Next.js app itself is stateless (deployable to multiple regions/instances behind a load balancer; the only shared, persistent state is the database and storage bucket).

## Known limitations & future work

- **PDF import is heuristic**, not true OCR/NLP question extraction — see [PDF question import](#pdf-question-import). Always reviewed by a human before commit, never auto-saved.
- **Rate limiting is in-memory per process** (`src/lib/rate-limit.ts`) — fine for a single Node instance; if you scale to multiple instances behind a load balancer, swap in a shared store (e.g. Upstash Redis) so limits apply globally, not per-instance.
- **Bulk import runs in one DB transaction** with an extended (60s) timeout — comfortable up to the documented `MAX_BULK_IMPORT_ROWS` (2000) cap. For very large recurring imports beyond that, move the confirm step to a background job queue instead of raising the timeout further.
- **Drag-and-drop reordering** in the Paper Builder is implemented as Move Up/Down buttons rather than pointer drag-and-drop — fully keyboard-accessible and equivalent in capability, just a different interaction model.
- **Server-side PDF export** requires headless Chromium (`@sparticuz/chromium` in production, or a local Chrome/Chromium via `PUPPETEER_EXECUTABLE_PATH` in development) — see `src/lib/pdf/paperPdf.ts`. If that pipeline is ever unavailable, every paper remains exportable via the in-browser Print → Save as PDF flow (`/papers/:id/print`), which uses the identical HTML/CSS/MathJax rendering.
- **Handwritten PDF Import quality depends entirely on how legible the source is and on Claude's ability to describe the geometry it sees.** Complex diagrams (detailed circuit schematics, dense chemistry structures, multi-axis graphs) more frequently land in `needsReview` than simple ones (a labeled triangle, a single line graph) — by design, per "if the system cannot confidently understand part of a diagram, mark it for human review rather than silently guessing." Always review before confirming, especially anything flagged Medium/Low confidence.
- **"Regenerate" re-runs recognition on the cropped original region only**, not the whole page/document — if the crop itself missed part of the diagram (a bounding-box error from the first pass), regenerating won't recover what's outside that crop; use "Edit" to hand-correct the SVG in that case instead.
- **CSV bulk import carries the same full tag set as Add Question** — Question Type, Chapter, Topic, and Marks (the Subjective-only grading rubric, same underlying field as "Marking Scheme" elsewhere) are all columns in `public/templates/question_import_template.csv` (`CSV_TEMPLATE_HEADERS` in `src/lib/validation/bulkImport.ts`), in this exact order: Question, Question Type, Option A–D, Correct Answer, Marks, Explanation, Subject, Class, Chapter, Topic, Code, Difficulty, Question Number. Question Type defaults to `MCQ` when blank (old CSVs without the column still import); Chapter/Topic remain fully optional but, if given, must match an existing chapter (scoped to the row's Subject) / topic (scoped to the row's Chapter) or the row is rejected at preview time with a specific "unknown value" error, same as Subject/Class/Code/Difficulty. **Export CSV** (`GET /api/questions/export`) uses the identical column order, so an exported file is directly re-importable.
- **Chapters/Topics seed data was written (`CHAPTERS_SEED` in `src/lib/constants.ts`) but has not yet been run against the production database** — `npm run db:seed` applies it to any fresh/local database; production currently has the `chapters`/`topics` tables live but empty until seeded or populated via the "+ Create" quick-add in the Question form / `Settings → Chapters & topics`.

## Project structure

```
prisma/schema.prisma        Full normalized data model (see inline comments)
prisma/seed.ts               Demo data: lookups, 1 Owner + 8 Users, 100+ questions
supabase/sql/                One-time SQL to run in the Supabase SQL Editor
src/app/(auth)/               Login / register pages
src/app/(dashboard)/          Every authenticated screen (sidebar + topbar layout)
src/app/api/                  All API routes (REST-ish, one folder per resource)
src/app/papers/[id]/print/    Auth-gated, print-ready HTML render (also used by PDF export)
src/lib/                      Business logic: auth, validation, paper generation,
                               duplicate detection, PDF rendering, audit logging
src/components/               React components, grouped by feature area
tests/unit/                   Vitest — pure-logic modules
tests/e2e/                    Playwright — full-stack smoke test
```
