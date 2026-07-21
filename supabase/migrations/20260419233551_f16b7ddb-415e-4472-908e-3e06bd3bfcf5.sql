create type public.project_type as enum ('website', 'webapp', 'mobile_app');
create type public.project_status as enum ('draft', 'active', 'archived');
create type public.message_role as enum ('user', 'assistant', 'system', 'tool');
create type public.elena_mode as enum ('auto', 'eco', 'standard', 'premium');
create type public.ai_provider as enum ('lovable', 'openai', 'anthropic', 'google', 'huggingface', 'replicate');

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  type public.project_type not null default 'website',
  status public.project_status not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_projects_owner on public.projects(owner_id);
alter table public.projects enable row level security;
create policy "owner_select_projects" on public.projects for select to authenticated using (owner_id = auth.uid());
create policy "owner_insert_projects" on public.projects for insert to authenticated with check (owner_id = auth.uid());
create policy "owner_update_projects" on public.projects for update to authenticated using (owner_id = auth.uid());
create policy "owner_delete_projects" on public.projects for delete to authenticated using (owner_id = auth.uid());
create trigger trg_projects_updated before update on public.projects for each row execute function public.set_updated_at();

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  title text not null default 'Nouvelle conversation',
  summary text,
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_conversations_owner on public.conversations(owner_id);
create index idx_conversations_project on public.conversations(project_id);
alter table public.conversations enable row level security;
create policy "owner_select_conv" on public.conversations for select to authenticated using (owner_id = auth.uid());
create policy "owner_insert_conv" on public.conversations for insert to authenticated with check (owner_id = auth.uid());
create policy "owner_update_conv" on public.conversations for update to authenticated using (owner_id = auth.uid());
create policy "owner_delete_conv" on public.conversations for delete to authenticated using (owner_id = auth.uid());

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  role public.message_role not null,
  content text not null,
  model_used text,
  tokens_input integer,
  tokens_output integer,
  cost_usd numeric(10,6),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index idx_messages_conv on public.messages(conversation_id, created_at);
create index idx_messages_owner on public.messages(owner_id);
alter table public.messages enable row level security;
create policy "owner_select_msg" on public.messages for select to authenticated using (owner_id = auth.uid());
create policy "owner_insert_msg" on public.messages for insert to authenticated with check (owner_id = auth.uid());
create policy "owner_delete_msg" on public.messages for delete to authenticated using (owner_id = auth.uid());

create table public.elena_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  default_mode public.elena_mode not null default 'auto',
  model_eco text not null default 'google/gemini-3-flash-preview',
  model_standard text not null default 'google/gemini-3-flash-preview',
  model_premium text not null default 'google/gemini-2.5-pro',
  system_prompt_website text not null default 'Tu es Elena, agent expert en création de sites web modernes.',
  system_prompt_webapp text not null default 'Tu es Elena, agent expert en applications web (React, backend, base de données).',
  system_prompt_mobile text not null default 'Tu es Elena, agent expert en applications mobiles (React Native).',
  auto_summarize_after integer not null default 20,
  max_context_messages integer not null default 30,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.elena_settings enable row level security;
create policy "owner_select_settings" on public.elena_settings for select to authenticated using (owner_id = auth.uid());
create policy "owner_insert_settings" on public.elena_settings for insert to authenticated with check (owner_id = auth.uid());
create policy "owner_update_settings" on public.elena_settings for update to authenticated using (owner_id = auth.uid());
create trigger trg_settings_updated before update on public.elena_settings for each row execute function public.set_updated_at();

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider public.ai_provider not null,
  label text,
  is_active boolean not null default true,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_id, provider)
);
alter table public.api_keys enable row level security;
create policy "owner_select_keys" on public.api_keys for select to authenticated using (owner_id = auth.uid());
create policy "owner_insert_keys" on public.api_keys for insert to authenticated with check (owner_id = auth.uid());
create policy "owner_update_keys" on public.api_keys for update to authenticated using (owner_id = auth.uid());
create policy "owner_delete_keys" on public.api_keys for delete to authenticated using (owner_id = auth.uid());