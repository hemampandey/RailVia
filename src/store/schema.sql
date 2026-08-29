-- Run this once in the Supabase SQL editor.
--
-- Three tables. `profiles` maps each authenticated user to a role;
-- `approvals` and `completions` hold planning decisions. Everything else in
-- the system is reproducible from a seed and the cached timetable, so nothing
-- else belongs in a database.

-- ── roles ───────────────────────────────────────────────────────────────
--
-- Two roles, matching how a division actually works:
--
--   head      the divisional planning officer. Grants closures. A block takes
--             track out of service, so authorising one is an authority
--             decision, not a departmental one.
--   engineer  ENGG / TRD / S&T staff. Reports work as done. Cannot grant
--             closures.
--
-- Both can see everything: an engineer needs the whole plan to know when
-- their section is free, and hiding it would help nobody.

do $$
begin
    if not exists (select 1 from pg_type where typname = 'planner_role') then
        create type planner_role as enum ('head', 'engineer');
    end if;
end
$$;

create table if not exists profiles (
    id         uuid primary key references auth.users (id) on delete cascade,
    role       planner_role not null default 'engineer',
    full_name  text not null default '',
    department text not null default '',
    created_at timestamptz not null default now()
);

-- Every new sign-up gets a profile automatically, defaulting to the lower
-- privilege. Promoting someone to head is a deliberate act, never a default.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    insert into public.profiles (id, full_name)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

create or replace function public.current_role_is(wanted planner_role)
returns boolean language sql stable security definer set search_path = public as $$
    select exists (
        select 1 from public.profiles
        where id = auth.uid() and role = wanted
    );
$$;

-- ── decisions ───────────────────────────────────────────────────────────

create table if not exists approvals (
    instance_id text not null,
    section_id  text not null,
    start_iso   text not null,
    decided_by  text not null default 'unknown',
    decided_at  text not null,
    note        text not null default '',
    primary key (instance_id, section_id, start_iso)
);

create table if not exists completions (
    instance_id  text not null,
    task_id      text not null,
    completed_at text not null,
    completed_by text not null default 'unknown',
    note         text not null default '',
    primary key (instance_id, task_id)
);

create index if not exists approvals_instance_idx on approvals (instance_id);
create index if not exists completions_instance_idx on completions (instance_id);

-- ── row level security ──────────────────────────────────────────────────
--
-- Enforced in the database, not just in the UI. Hiding a button is a
-- courtesy; this is the actual control. An engineer who calls the REST API
-- directly still cannot grant a closure.

alter table profiles    enable row level security;
alter table approvals   enable row level security;
alter table completions enable row level security;

drop policy if exists "read own profile"  on profiles;
drop policy if exists "read approvals"    on approvals;
drop policy if exists "head writes approvals" on approvals;
drop policy if exists "head deletes approvals" on approvals;
drop policy if exists "read completions"  on completions;
drop policy if exists "signed in writes completions" on completions;
drop policy if exists "signed in deletes completions" on completions;
drop policy if exists "demo full access"  on approvals;
drop policy if exists "demo full access"  on completions;

-- Anyone signed in may read their own profile and the whole plan's decisions.
create policy "read own profile" on profiles
    for select using (auth.uid() = id);

create policy "read approvals" on approvals
    for select using (auth.role() = 'authenticated');

create policy "read completions" on completions
    for select using (auth.role() = 'authenticated');

-- Granting a closure is the head's decision alone.
create policy "head writes approvals" on approvals
    for insert with check (public.current_role_is('head'));

create policy "head deletes approvals" on approvals
    for delete using (public.current_role_is('head'));

-- Reporting work done is anyone signed in — engineers do the work.
create policy "signed in writes completions" on completions
    for insert with check (auth.role() = 'authenticated');

create policy "signed in deletes completions" on completions
    for delete using (auth.role() = 'authenticated');

-- ── creating the two users ──────────────────────────────────────────────
--
-- In the Supabase dashboard: Authentication → Users → Add user, twice.
-- Then promote one of them:
--
--   update public.profiles set role = 'head', full_name = 'Divisional Officer'
--    where id = (select id from auth.users where email = 'head@example.com');
--
--   update public.profiles set role = 'engineer', full_name = 'Section Engineer',
--          department = 'ENGG'
--    where id = (select id from auth.users where email = 'engineer@example.com');
