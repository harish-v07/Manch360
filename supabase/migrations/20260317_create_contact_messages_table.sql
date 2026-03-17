-- Create contact_messages table
create table if not exists contact_messages (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  first_name text,
  last_name text,
  email text not null,
  message text
);

-- Enable Row Level Security (RLS)
alter table contact_messages enable row level security;

-- Allow anonymous users to insert messages (needed for the public contact form)
create policy "Allow internal submissions"
on contact_messages
for insert
to anon
with check (true);
