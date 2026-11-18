begin;
create table public.profiles (
 id uuid primary key references auth.users(id), name text not null check(length(name) between 1 and 100), email text not null,
 role text not null default 'employee' check(role in ('employee','admin')),
 access_status text not null default 'pending' check(access_status in ('pending','active','blocked')), created_at timestamptz not null default now()
);
create table public.tasks (
 id uuid primary key default gen_random_uuid(),title text not null check(length(title) between 1 and 200),description text not null default '' check(length(description)<=20000),
 status text not null default 'todo' check(status in ('todo','progress','review','done')),
 priority text not null default 'medium' check(priority in ('low','medium','high')),
 assignee_id uuid not null references public.profiles,created_by uuid not null references public.profiles,
 original_deadline timestamptz, deadline timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 completed_at timestamptz,completed_late boolean not null default false,ever_overdue boolean not null default false,
 archived_at timestamptz,version integer not null default 1,deadline_changes integer not null default 0,return_count integer not null default 0
);
create table public.deadline_requests (
 id uuid primary key default gen_random_uuid(),task_id uuid not null references public.tasks,requested_by uuid not null references public.profiles,
 proposed_deadline timestamptz not null,reason text not null default '' check(length(reason)<=4000),status text not null default 'pending' check(status in ('pending','approved','rejected')),
 reviewed_by uuid references public.profiles,reviewed_at timestamptz,created_at timestamptz not null default now()
);
create unique index one_pending_request on public.deadline_requests(task_id) where status='pending';
create table public.task_events (
 id uuid primary key default gen_random_uuid(),task_id uuid not null references public.tasks,actor_id uuid references public.profiles,actor_name text,event_type text not null,
 previous_value jsonb,new_value jsonb,metadata jsonb not null default '{}',created_at timestamptz not null default now()
);
create table public.task_comments (
 id uuid primary key default gen_random_uuid(),task_id uuid not null references public.tasks,author_id uuid not null references public.profiles,author_name text,
 content text not null check(length(content) between 1 and 5000),created_at timestamptz not null default now()
);
create table public.notifications (
 id uuid primary key default gen_random_uuid(),recipient_id uuid not null references public.profiles,task_id uuid references public.tasks,type text not null,
 is_read boolean not null default false,created_at timestamptz not null default now()
);
create index tasks_assignee on public.tasks(assignee_id);
create index tasks_status on public.tasks(status);
create index tasks_deadline on public.tasks(deadline);
create index tasks_created on public.tasks(created_at);
create index events_task on public.task_events(task_id,created_at);
create index comments_task on public.task_comments(task_id,created_at);
create index requests_task on public.deadline_requests(task_id);
create index notifications_recipient on public.notifications(recipient_id,is_read);
create function public.new_profile() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(id,name,email) values(new.id,left(coalesce(nullif(trim(new.raw_user_meta_data->>'name'),''),'Участник'),100),new.email);return new;
end;$$;
create trigger on_signup after insert on auth.users for each row execute function public.new_profile();
create function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and access_status='active');$$;
create function public.is_active() returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles where id=auth.uid() and access_status='active');$$;
create function public.can_read_task(tid uuid) returns boolean language sql stable security definer set search_path=public as $$
 select public.is_active() and exists(select 1 from public.tasks where id=tid and (assignee_id=auth.uid() or public.is_admin()));$$;
alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.deadline_requests enable row level security;
alter table public.task_events enable row level security;
alter table public.task_comments enable row level security;
alter table public.notifications enable row level security;
create policy profiles_read on public.profiles for select to authenticated using(id=auth.uid() or public.is_admin());
create policy tasks_read on public.tasks for select to authenticated using(public.is_active() and (assignee_id=auth.uid() or public.is_admin()));
create policy requests_read on public.deadline_requests for select to authenticated using(public.can_read_task(task_id));
create policy events_read on public.task_events for select to authenticated using(public.can_read_task(task_id));
create policy comments_read on public.task_comments for select to authenticated using(public.can_read_task(task_id));
create policy notifications_read on public.notifications for select to authenticated using(recipient_id=auth.uid() and public.is_active());
revoke all on public.profiles,public.tasks,public.deadline_requests,public.task_events,public.task_comments,public.notifications from anon,authenticated;
grant select on public.profiles,public.tasks,public.deadline_requests,public.task_events,public.task_comments,public.notifications to authenticated;
create function public.log_event(tid uuid,kind text,oldval jsonb default null,newval jsonb default null) returns void language sql security definer set search_path=public as $$
 insert into public.task_events(task_id,actor_id,actor_name,event_type,previous_value,new_value) values(tid,auth.uid(),(select name from public.profiles where id=auth.uid()),kind,oldval,newval);$$;
create function public.notify(tid uuid,kind text,to_admin boolean) returns void language sql security definer set search_path=public as $$
 insert into public.notifications(recipient_id,task_id,type)
 select id,tid,kind from public.profiles where access_status='active' and (case when to_admin then role='admin' else id=(select assignee_id from public.tasks where id=tid) end);$$;
create function public.record_overdue(tid uuid) returns void language plpgsql security definer set search_path=public as $$
declare t public.tasks;
begin
 select * into t from public.tasks where id=tid for update;
 if t.deadline<now() and t.status<>'done' and not exists(select 1 from public.task_events where task_id=t.id and event_type='overdue' and new_value->>'deadline'=to_jsonb(t.deadline)#>>'{}') then
  perform public.log_event(t.id,'overdue',null,jsonb_build_object('deadline',t.deadline,'occurred_at',t.deadline));
  update public.tasks set ever_overdue=true where id=tid;
 end if;
end;$$;
create function public.sync_overdue() returns void language plpgsql security definer set search_path=public as $$
declare tid uuid;
begin
 if not public.is_active() then raise exception 'Доступ ещё не подтверждён';end if;
 for tid in select id from public.tasks where (assignee_id=auth.uid() or public.is_admin()) and deadline<now() and status<>'done' and archived_at is null order by id loop perform public.record_overdue(tid);end loop;
end;$$;
create function public.task_action(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare me public.profiles;t public.tasks;r public.deadline_requests;tid uuid;target uuid;newdate timestamptz;newstatus text;reason text;v integer;
begin
 select * into me from public.profiles where id=auth.uid() for share;
 if me.id is null or me.access_status<>'active' then raise exception 'Доступ к рабочему пространству не предоставлен';end if;
 if action='read_notifications' then update public.notifications set is_read=true where recipient_id=me.id;return '{}';end if;
 if action='access' then
  if me.role<>'admin' then raise exception 'Недостаточно прав';end if;
  if payload->>'status' not in ('active','blocked') then raise exception 'Некорректный статус';end if;
  update public.profiles set access_status=payload->>'status' where id=(payload->>'id')::uuid and role='employee';
  if not found then raise exception 'Сотрудник не найден';end if;return '{}';
 end if;
 if action='create' then
  target=case when me.role='admin' then (payload->>'assignee_id')::uuid else me.id end;
  if not exists(select 1 from public.profiles where id=target and access_status='active') then raise exception 'Выберите активного исполнителя';end if;
  newdate=nullif(payload->>'deadline','')::timestamptz;
  insert into public.tasks(title,description,priority,assignee_id,created_by,deadline,original_deadline)
  values(trim(payload->>'title'),coalesce(payload->>'description',''),coalesce(payload->>'priority','medium'),target,me.id,case when me.role='admin' then newdate end,case when me.role='admin' then newdate end) returning id into tid;
  perform public.log_event(tid,'created',null,jsonb_build_object('title',payload->>'title','assignee_id',target,'deadline',case when me.role='admin' then newdate end));
  perform public.notify(tid,'assigned',false);
  if me.role<>'admin' and newdate is not null then
   insert into public.deadline_requests(task_id,requested_by,proposed_deadline) values(tid,me.id,newdate);
   perform public.log_event(tid,'deadline_requested',null,jsonb_build_object('deadline',newdate));perform public.notify(tid,'deadline_requested',true);
  end if;
  perform public.record_overdue(tid);return jsonb_build_object('id',tid);
 end if;
 tid=(payload->>'id')::uuid;
 select * into t from public.tasks where id=tid for update;
 if t.id is null or (me.role<>'admin' and t.assignee_id<>me.id) then raise exception 'Задача недоступна';end if;
 v=(payload->>'version')::integer;
 if v is null or v<>t.version then raise exception 'Задача уже изменена. Обновите данные и повторите действие.';end if;
 if t.archived_at is not null and action<>'restore' then raise exception 'Сначала восстановите задачу';end if;
 perform public.record_overdue(tid);
 if action='comment' then
  insert into public.task_comments(task_id,author_id,author_name,content) values(tid,me.id,me.name,trim(payload->>'content'));
 elsif action='status' then
  newstatus=payload->>'status';reason=trim(coalesce(payload->>'reason',''));
  if t.status='done' or newstatus=t.status then raise exception 'Этот переход недоступен';end if;
  if newstatus='done' and (me.role<>'admin' or t.status<>'review') then raise exception 'Принять задачу может только администратор после проверки';end if;
  if not ((t.status='todo' and newstatus='progress') or (t.status='progress' and newstatus in ('todo','review')) or (t.status='review' and newstatus in ('progress','done'))) then raise exception 'Недопустимый переход статуса';end if;
  if t.status='review' and newstatus='progress' and (me.role<>'admin' or length(reason)=0) then raise exception 'Для возврата администратор должен указать причину';end if;
  if newstatus='done' and exists(select 1 from public.deadline_requests where task_id=tid and status='pending') then raise exception 'Сначала рассмотрите запрос срока, затем примите задачу';end if;
  update public.tasks set status=newstatus,completed_at=case when newstatus='done' then now() end,
   completed_late=case when newstatus='done' then coalesce(deadline<now(),false) else false end,
   return_count=return_count+case when t.status='review' and newstatus='progress' then 1 else 0 end where id=tid;
  perform public.log_event(tid,'status',jsonb_build_object('status',t.status),jsonb_build_object('status',newstatus,'reason',reason));
  if newstatus='review' then perform public.notify(tid,'review',true);end if;
  if t.status='review' then perform public.notify(tid,case when newstatus='done' then 'accepted' else 'returned' end,false);end if;
 elsif action='update' then
  if me.role<>'admin' or t.status='done' then raise exception 'Редактирование недоступно';end if;
  target=(payload->>'assignee_id')::uuid;
  if not exists(select 1 from public.profiles where id=target and access_status='active') then raise exception 'Выберите активного исполнителя';end if;
  update public.tasks set title=trim(payload->>'title'),description=coalesce(payload->>'description',''),priority=payload->>'priority',assignee_id=target where id=tid;
  perform public.log_event(tid,'updated',jsonb_build_object('title',t.title,'description',t.description,'priority',t.priority,'assignee_id',t.assignee_id),payload- 'id'-'version');
  if t.assignee_id<>target then perform public.notify(tid,'assigned',false);end if;
 elsif action='request_deadline' then
  if t.status='done' then raise exception 'Задача уже принята';end if;
  newdate=(payload->>'deadline')::timestamptz;reason=trim(coalesce(payload->>'reason',''));
  if t.deadline is not null and length(reason)=0 then raise exception 'Укажите причину переноса';end if;
  insert into public.deadline_requests(task_id,requested_by,proposed_deadline,reason) values(tid,me.id,newdate,reason);
  perform public.log_event(tid,'deadline_requested',jsonb_build_object('deadline',t.deadline),jsonb_build_object('deadline',newdate,'reason',reason));perform public.notify(tid,'deadline_requested',true);
 elsif action in ('set_deadline','approve','reject') then
  if me.role<>'admin' or t.status='done' then raise exception 'Изменение срока недоступно';end if;
  if action in ('approve','reject') then
   select * into r from public.deadline_requests where id=(payload->>'request_id')::uuid and task_id=tid and status='pending' for update;
   if r.id is null then raise exception 'Запрос уже обработан';end if;
   newdate=coalesce(nullif(payload->>'deadline','')::timestamptz,r.proposed_deadline);
   update public.deadline_requests set status=case when action='approve' then 'approved' else 'rejected' end,reviewed_by=me.id,reviewed_at=now() where id=r.id;
  else
   newdate=nullif(payload->>'deadline','')::timestamptz;
   if newdate is null then raise exception 'Нельзя удалять официальный срок';end if;
   if exists(select 1 from public.deadline_requests where task_id=tid and status='pending') then raise exception 'Сначала рассмотрите текущий запрос срока';end if;
  end if;
  if action<>'reject' then
   update public.tasks set deadline=newdate,original_deadline=coalesce(original_deadline,newdate),deadline_changes=deadline_changes+case when deadline is not null and deadline is distinct from newdate then 1 else 0 end where id=tid;
  end if;
  perform public.log_event(tid,case action when 'approve' then 'deadline_approved' when 'reject' then 'deadline_rejected' else 'deadline_set' end,jsonb_build_object('deadline',t.deadline),jsonb_build_object('deadline',newdate,'request_id',r.id));
  perform public.notify(tid,case when action='reject' then 'deadline_rejected' else 'deadline_approved' end,false);
 elsif action in ('archive','restore') then
  if me.role<>'admin' then raise exception 'Архив доступен только администратору';end if;
  update public.tasks set archived_at=case when action='archive' then now() else null end where id=tid;
  perform public.log_event(tid,case when action='archive' then 'archived' else 'restored' end);
 else raise exception 'Неизвестное действие';
 end if;
 update public.tasks set version=version+1,updated_at=now() where id=tid;
 perform public.record_overdue(tid);
 return jsonb_build_object('id',tid);
end;$$;
revoke all on function public.new_profile(),public.log_event(uuid,text,jsonb,jsonb),public.notify(uuid,text,boolean),public.record_overdue(uuid),public.task_action(text,jsonb),public.sync_overdue(),public.is_admin(),public.is_active(),public.can_read_task(uuid) from public,anon,authenticated;
grant execute on function public.task_action(text,jsonb),public.sync_overdue(),public.is_admin(),public.is_active(),public.can_read_task(uuid) to authenticated;
-- One statement returns a consistent snapshot without PostgREST's default row cap.
-- SECURITY INVOKER is intentional: every aggregate still respects RLS.
create function public.workspace_data() returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object(
  'profile',(select to_jsonb(p) from public.profiles p where id=auth.uid()),
  'profiles',coalesce((select jsonb_agg(p order by p.created_at,p.id) from public.profiles p),'[]'),
  'tasks',coalesce((select jsonb_agg(t order by t.created_at,t.id) from public.tasks t),'[]'),
  'requests',coalesce((select jsonb_agg(r order by r.created_at,r.id) from public.deadline_requests r),'[]'),
  'events',coalesce((select jsonb_agg(e order by e.created_at,e.id) from public.task_events e),'[]'),
  'comments',coalesce((select jsonb_agg(c order by c.created_at,c.id) from public.task_comments c),'[]'),
  'notifications',coalesce((select jsonb_agg(n order by n.created_at,n.id) from public.notifications n),'[]'),
  'serverNow',now()
 );$$;
revoke all on function public.workspace_data() from public,anon;
grant execute on function public.workspace_data() to authenticated;
commit;
