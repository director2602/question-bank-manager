-- Lets a QuestionImage be tagged as illustrating one specific MCQ option
-- (A/B/C/D) instead of only the question as a whole — so an option can be
-- a diagram/figure, not just text. Null (the existing default for every
-- current row) keeps meaning "a general question image", unchanged.
alter table public.question_images
  add column if not exists option_slot text
    check (option_slot is null or option_slot in ('A', 'B', 'C', 'D'));
