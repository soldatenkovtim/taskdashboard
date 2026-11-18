-- Require a deadline for new tasks; employee proposals still need approval.
-- Existing tasks and their historical deadlines are unchanged.
begin;
create or replace function public.task_action(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
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
  newdate=nullif(trim(payload->>'deadline'),'')::timestamptz;
  if newdate is null or not isfinite(newdate) then raise exception 'Укажите дату и время дедлайна';end if;
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
commit;
