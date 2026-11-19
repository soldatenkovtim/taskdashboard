begin;
create table public.file_projects (
 id uuid primary key default gen_random_uuid(), name text not null unique check(length(trim(name)) between 1 and 120),
 created_by uuid not null references public.profiles, created_at timestamptz not null default now()
);
create table public.project_materials (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.file_projects,
 task_id uuid references public.tasks, title text not null check(length(trim(title)) between 1 and 200),
 description text not null default '' check(length(description)<=4000),
 kind text not null check(kind in ('file','link')), url text, object_path text unique, file_name text,
 uploaded_by uuid not null references public.profiles, author_name text not null,
 ready boolean not null default false, published_at timestamptz, created_at timestamptz not null default now(),
 check((kind='link' and length(url)<=4000 and url ~* '^https?://[^[:space:]]+$' and object_path is null) or (kind='file' and url is null and object_path is not null and file_name is not null and length(file_name) between 1 and 255))
);
create index materials_project on public.project_materials(project_id,created_at desc);
create index materials_task on public.project_materials(task_id);
create table public.material_comments (
 id uuid primary key default gen_random_uuid(), material_id uuid not null references public.project_materials,
 author_id uuid not null references public.profiles, author_name text not null,
 content text not null check(length(trim(content)) between 1 and 4000), created_at timestamptz not null default now()
);
create index material_comments_parent on public.material_comments(material_id,created_at);
alter table public.file_projects enable row level security;
alter table public.project_materials enable row level security;
alter table public.material_comments enable row level security;
create function public.can_read_material(mid uuid) returns boolean language sql stable security definer set search_path=public as $$
 select public.is_active() and exists(select 1 from public.project_materials m where m.id=mid and
 (m.published_at is not null or (m.task_id is not null and public.can_read_task(m.task_id)) or (m.task_id is null and m.uploaded_by=auth.uid()) or public.is_admin()));
$$;
create policy projects_read on public.file_projects for select to authenticated using(public.is_active());
create policy materials_read on public.project_materials for select to authenticated using(public.can_read_material(id));
create policy material_comments_read on public.material_comments for select to authenticated using(public.can_read_material(material_id));
revoke all on public.file_projects,public.project_materials,public.material_comments from anon,authenticated;
grant select on public.file_projects,public.project_materials,public.material_comments to authenticated;

-- All mutations go through RPC; clients cannot set ready/publication or forge authors.
create function public.material_action(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare me public.profiles; m public.project_materials; t public.tasks; mid uuid; pid uuid; tid uuid; k text; path text;
begin
 select * into me from public.profiles where id=auth.uid();
 if me.id is null or me.access_status<>'active' then raise exception 'Нет доступа'; end if;
 if action='project' then
  insert into public.file_projects(name,created_by) values(trim(payload->>'name'),me.id) returning id into pid;
  return jsonb_build_object('id',pid);
 elsif action='add' then
  pid=(payload->>'project_id')::uuid; tid=nullif(payload->>'task_id','')::uuid;
  if tid is not null then
   select * into t from public.tasks where id=tid for update;
   if t.id is null or not public.can_read_task(tid) then raise exception 'Задача недоступна'; end if;
  end if;
  mid=gen_random_uuid(); k=payload->>'kind';
  if k='file' then path=me.id::text||'/'||mid::text; end if;
  insert into public.project_materials(id,project_id,task_id,title,description,kind,url,object_path,file_name,uploaded_by,author_name,ready,published_at)
  values(mid,pid,tid,trim(payload->>'title'),coalesce(payload->>'description',''),k,
   case when k='link' then payload->>'url' end,path,case when k='file' then payload->>'file_name' end,me.id,me.name,
   k='link',case when k='link' and (tid is null or t.status='done') then now() end);
  return jsonb_build_object('id',mid,'path',path);
 elsif action='finalize' then
  -- Match lock order of task acceptance: task first, material second.
  select task_id into tid from public.project_materials where id=(payload->>'id')::uuid;
  if tid is not null then select * into t from public.tasks where id=tid for update; end if;
  select * into m from public.project_materials where id=(payload->>'id')::uuid for update;
  if m.id is null or m.uploaded_by<>me.id or not public.can_read_material(m.id) then raise exception 'Материал недоступен'; end if;
  if m.kind<>'file' then raise exception 'Ожидается файл'; end if;
  if not exists(select 1 from storage.objects where bucket_id='project-files' and name=m.object_path) then raise exception 'Загрузка файла не завершена'; end if;
  update public.project_materials set ready=true,published_at=coalesce(published_at,case when task_id is null or t.status='done' then now() end) where id=m.id;
  return jsonb_build_object('id',m.id);
 elsif action='comment' then
  mid=(payload->>'id')::uuid;
  if not public.can_read_material(mid) then raise exception 'Материал недоступен'; end if;
  insert into public.material_comments(material_id,author_id,author_name,content) values(mid,me.id,me.name,trim(payload->>'content'));
  return jsonb_build_object('id',mid);
 end if;
 raise exception 'Неизвестная операция';
end;$$;
create function public.publish_task_materials() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status='done' and old.status<>'done' then
  update public.project_materials set published_at=now() where task_id=new.id and ready and published_at is null;
 end if;
 return new;
end;$$;
create trigger publish_accepted_materials after update of status on public.tasks for each row execute function public.publish_task_materials();
revoke all on function public.material_action(text,jsonb),public.can_read_material(uuid),public.publish_task_materials() from public,anon,authenticated;
grant execute on function public.material_action(text,jsonb),public.can_read_material(uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit) values('project-files','project-files',false,26214400);
create policy project_files_insert on storage.objects for insert to authenticated with check(
 bucket_id='project-files' and public.is_active() and exists(select 1 from public.project_materials m
 where m.object_path=name and m.uploaded_by=auth.uid() and not m.ready and (m.task_id is null or public.can_read_task(m.task_id)))
);
create policy project_files_read on storage.objects for select to authenticated using(
 bucket_id='project-files' and exists(select 1 from public.project_materials m where m.object_path=name and m.ready and public.can_read_material(m.id))
);
-- No UPDATE/DELETE object policies: accepted artifacts cannot be silently replaced.
commit;
