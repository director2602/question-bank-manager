-- ─────────────────────────────────────────────────────────────────────────
-- Adds paper folders (Saved Papers organization) and per-paper layout /
-- typography / export settings. Purely additive — no existing table is
-- altered destructively, no existing data is touched.
--
-- Deleting a folder never deletes the papers inside it: papers.folder_id
-- is ON DELETE SET NULL, so a paper whose folder is removed simply falls
-- back to "Uncategorized" (folder_id = null), which is also every paper's
-- starting state.
-- ─────────────────────────────────────────────────────────────────────────

create table public.paper_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_by_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.paper_folders enable row level security;

alter table public.papers
  add column folder_id uuid references public.paper_folders(id) on delete set null;
create index papers_folder_id_idx on public.papers(folder_id);

create type "PageSize" as enum ('A4', 'LETTER', 'LEGAL');
create type "PageOrientation" as enum ('PORTRAIT', 'LANDSCAPE');
create type "ImageAlignment" as enum ('LEFT', 'CENTER', 'RIGHT');

-- One row per paper. Created lazily (with these defaults) the first time
-- GET /api/papers/:id/settings is called for a paper that doesn't have one
-- yet. Applied identically by the print view, the PDF exporter, and the
-- DOCX exporter.
create table public.paper_settings (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null unique references public.papers(id) on delete cascade,

  page_size "PageSize" not null default 'A4',
  orientation "PageOrientation" not null default 'PORTRAIT',

  margin_top_mm double precision not null default 18,
  margin_bottom_mm double precision not null default 18,
  margin_left_mm double precision not null default 16,
  margin_right_mm double precision not null default 16,

  columns integer not null default 2,
  column_gap_mm double precision not null default 8,
  show_header boolean not null default true,
  show_footer boolean not null default true,
  show_page_numbers boolean not null default true,

  font_family text not null default 'Calibri',
  font_size_pt double precision not null default 11,
  line_spacing double precision not null default 1.5,
  question_spacing_px double precision not null default 16,

  image_quality_percent integer not null default 90,
  max_image_width_mm double precision not null default 85,
  image_alignment "ImageAlignment" not null default 'LEFT',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.paper_settings enable row level security;
