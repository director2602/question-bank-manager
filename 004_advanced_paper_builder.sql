-- ─────────────────────────────────────────────────────────────────────────
-- Advanced Paper Builder & Custom Paper Design — adds question type/
-- chapter/topic tagging, flexible multi-section papers, a custom paper
-- heading, and configurable question-numbering/marks-display styles.
--
-- Purely additive, with exactly one column swap: paper_questions.
-- section_label was added in 003 as a placeholder and never actually set
-- anywhere in the application (confirmed by inspection of api/papers) — it
-- is dropped here and replaced with a real section_id foreign key into the
-- new paper_sections table. No other existing column, table, or row is
-- altered or removed. No existing data is touched other than the new
-- question_type column being backfilled to 'MCQ' on every existing
-- question (matching how every question in this app has always been
-- authored — option-based).
-- ─────────────────────────────────────────────────────────────────────────

-- Adding a new value to an existing enum type must not be used (in DML/DDL)
-- within the SAME transaction it was added in on Postgres — kept as its own
-- isolated statement, first in this file, even though nothing later in this
-- file references 'HYBRID'.
alter type "PaperMode" add value 'HYBRID';

create type "QuestionType" as enum ('MCQ', 'SUBJECTIVE', 'INTEGER');

alter table public.questions
  add column question_type "QuestionType" not null default 'MCQ';
create index questions_question_type_idx on public.questions(question_type);

create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete restrict,
  code text not null,
  label text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  unique (subject_id, code)
);
alter table public.chapters enable row level security;
create index chapters_subject_id_idx on public.chapters(subject_id);

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters(id) on delete restrict,
  code text not null,
  label text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  unique (chapter_id, code)
);
alter table public.topics enable row level security;
create index topics_chapter_id_idx on public.topics(chapter_id);

alter table public.questions
  add column chapter_id uuid references public.chapters(id) on delete set null,
  add column topic_id uuid references public.topics(id) on delete set null;
create index questions_chapter_id_idx on public.questions(chapter_id);
create index questions_topic_id_idx on public.questions(topic_id);

alter table public.papers
  add column subtitle text,
  add column heading_config jsonb;

create type "SectionNumberingMode" as enum ('CONTINUE', 'RESTART');
create type "AnswerSpaceSize" as enum ('NONE', 'SMALL', 'MEDIUM', 'LARGE', 'CUSTOM');

create table public.paper_sections (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references public.papers(id) on delete cascade,
  position integer not null,
  label text not null,
  title text not null,
  instructions text,
  numbering_mode "SectionNumberingMode" not null default 'CONTINUE',
  answer_space "AnswerSpaceSize" not null default 'MEDIUM',
  custom_answer_space_mm double precision,
  type_config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (paper_id, position)
);
alter table public.paper_sections enable row level security;
create index paper_sections_paper_id_idx on public.paper_sections(paper_id);

alter table public.paper_questions
  add column section_id uuid references public.paper_sections(id) on delete set null;
create index paper_questions_section_id_idx on public.paper_questions(section_id);
alter table public.paper_questions drop column section_label;

create type "QuestionNumberingStyle" as enum ('PLAIN', 'Q_PREFIX', 'LETTERED');
create type "MarksDisplayStyle" as enum ('BRACKET_MARKS', 'PAREN_NUMBER', 'BRACKET_NUMBER');

alter table public.paper_settings
  add column question_numbering_style "QuestionNumberingStyle" not null default 'Q_PREFIX',
  add column marks_display_style "MarksDisplayStyle" not null default 'BRACKET_MARKS';
