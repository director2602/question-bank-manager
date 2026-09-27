-- Adds "confirmed" tracking to import_jobs so a handwritten-PDF review
-- can't be double-imported into the Question Bank, while keeping the
-- job's result_json (and original file) intact and inspectable either way.
alter table public.import_jobs
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_question_count integer;
