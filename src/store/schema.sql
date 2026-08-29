-- Run this once in the Supabase SQL editor.
--
-- Two tables, both small. They hold planning DECISIONS — which proposed
-- closures a planner accepted, and which jobs were reported done. Everything
-- else in the system is reproducible from a seed and the cached timetable,
-- so nothing else belongs in a database.

create table if not exists approvals (
    instance_id text not null,
    section_id  text not null,
    start_iso   text not null,
    decided_by  text not null default 'demo-planner',
    decided_at  text not null,
    note        text not null default '',
    primary key (instance_id, section_id, start_iso)
);

create table if not exists completions (
    instance_id  text not null,
    task_id      text not null,
    completed_at text not null,
    completed_by text not null default 'demo-planner',
    note         text not null default '',
    primary key (instance_id, task_id)
);

create index if not exists approvals_instance_idx on approvals (instance_id);
create index if not exists completions_instance_idx on completions (instance_id);

-- Row Level Security.
--
-- These policies allow anonymous read and write, which is right for a
-- prototype demo and WRONG for anything real: a live deployment must scope
-- writes to an authenticated planner, so `decided_by` means something and an
-- approval cannot be forged. Stated here rather than left as a silent hole.
alter table approvals   enable row level security;
alter table completions enable row level security;

drop policy if exists "demo full access" on approvals;
create policy "demo full access" on approvals
    for all using (true) with check (true);

drop policy if exists "demo full access" on completions;
create policy "demo full access" on completions
    for all using (true) with check (true);
