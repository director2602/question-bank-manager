-- ─────────────────────────────────────────────────────────────────────────
-- 1) Exam Category — a standalone "target exam" tag (NEET / IIT-JEE Main /
--    IIT-JEE Advance / Foundation), independent of exam_classes (class
--    number + broad exam type, e.g. "11 JEE") and codes (plain set letter
--    A/B/C/D). Nullable FK on questions — every existing question keeps
--    working exactly as it does today, simply untagged by this new field.
--
-- 2) Paper-scoped question content overrides — nullable *_override columns
--    on paper_questions. Null (every existing row, and every row nobody
--    edits) means "use the live question_versions content", exactly as
--    before. Only set when someone explicitly edits a question's wording
--    from inside one specific paper (PATCH /api/papers/:id/questions/:id) —
--    never written to by anything that touches the master Question Bank.
--
-- Purely additive: no existing column, table, row, or constraint is
-- altered or removed.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.exam_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true
);
alter table public.exam_categories enable row level security;

insert into public.exam_categories (code, label, sort_order) values
  ('NEET', 'NEET', 1),
  ('IIT_JEE_MAIN', 'IIT-JEE Main', 2),
  ('IIT_JEE_ADVANCE', 'IIT-JEE Advance', 3),
  ('FOUNDATION', 'Foundation', 4)
on conflict (code) do nothing;

alter table public.questions
  add column if not exists exam_category_id uuid references public.exam_categories(id) on delete set null;
create index if not exists questions_exam_category_id_idx on public.questions(exam_category_id);

alter table public.paper_questions
  add column if not exists question_text_override text,
  add column if not exists option_a_override text,
  add column if not exists option_b_override text,
  add column if not exists option_c_override text,
  add column if not exists option_d_override text,
  add column if not exists correct_answer_override text,
  add column if not exists explanation_override text,
  add column if not exists marking_scheme_override text;
