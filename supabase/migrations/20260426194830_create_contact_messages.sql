create table public.contact_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 120),
  company     text check (char_length(company) <= 160),
  email       text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  message     text not null check (char_length(message) between 5 and 4000),
  created_at  timestamptz not null default now()
);

alter table public.contact_messages enable row level security;

create policy "anon can insert contact messages"
  on public.contact_messages
  for insert
  to anon
  with check (true);
