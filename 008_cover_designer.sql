-- ─────────────────────────────────────────────────────────────────────────
-- Cover Page Designer (add-on). Purely additive: two new nullable/defaulted
-- columns on papers, one new enum value on the existing import_jobs kind
-- (reused for "Analyze Design" AI jobs — no parallel job table), and one
-- new standalone table for reusable Cover Templates. No existing column,
-- table, row, or enum value is altered or removed.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.papers
  add column if not exists cover_design jsonb,
  add column if not exists separate_front_page boolean not null default true;

alter type "ImportJobKind" add value if not exists 'COVER_DESIGN_ANALYSIS';

create table public.cover_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  design jsonb not null,
  is_default boolean not null default false,
  created_by_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.cover_templates enable row level security;
create index cover_templates_created_by_id_idx on public.cover_templates(created_by_id);
