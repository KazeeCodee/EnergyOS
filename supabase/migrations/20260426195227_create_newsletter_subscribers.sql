create table public.newsletter_subscribers (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  source      text default 'footer',
  created_at  timestamptz not null default now()
);

alter table public.newsletter_subscribers enable row level security;

create policy "anon can subscribe"
  on public.newsletter_subscribers
  for insert
  to anon
  with check (true);
