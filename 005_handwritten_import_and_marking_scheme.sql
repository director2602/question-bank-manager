-- ─────────────────────────────────────────────────────────────────────────
-- Handwritten PDF import (async job) + SUBJECTIVE marking scheme.
-- Purely additive: one new nullable column on question_versions, and one
-- new standalone table. No existing column, table, or row is altered or
-- removed, and no existing data is touched.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.question_versions
  add column marking_scheme text;

create type "ImportJobKind" as enum ('HANDWRITTEN_PDF');
create type "ImportJobStatus" as enum ('PENDING', 'PROCESSING', 'REVIEW', 'FAILED');

create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  kind "ImportJobKind" not null default 'HANDWRITTEN_PDF',
  status "ImportJobStatus" not null default 'PENDING',
  stage text,
  total_pages integer,
  original_file_name text not null,
  original_storage_path text not null,
  subject_id uuid references public.subjects(id) on delete set null,
  exam_class_id uuid references public.exam_classes(id) on delete set null,
  code_id uuid references public.codes(id) on delete set null,
  result_json jsonb,
  error_message text,
  created_by_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.import_jobs enable row level security;
create index import_jobs_created_by_id_idx on public.import_jobs(created_by_id);
create index import_jobs_status_idx on public.import_jobs(status);
