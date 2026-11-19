begin;

alter policy tasks_read on public.tasks using (public.is_active());
alter policy requests_read on public.deadline_requests using (public.is_active());
alter policy comments_read on public.task_comments using (public.is_active());
alter policy events_read on public.task_events using (public.is_active());

-- Only the directory fields needed for the board are shared with colleagues.
create function public.board_profiles() returns jsonb
language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(
   case when public.is_admin() or p.id=auth.uid() then to_jsonb(p)
   else jsonb_build_object('id',p.id,'name',p.name,'avatar_id',p.avatar_id,
                           'role',p.role,'access_status',p.access_status) end
   order by p.created_at,p.id), '[]'::jsonb)
 from public.profiles p
 where p.id=auth.uid() or public.is_admin() or (public.is_active() and p.access_status='active');
$$;
revoke all on function public.board_profiles() from public,anon;
grant execute on function public.board_profiles() to authenticated;

create or replace function public.workspace_data() returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object(
  'profile',(select to_jsonb(p) from public.profiles p where id=auth.uid()),
  'profiles',public.board_profiles(),
  'tasks',coalesce((select jsonb_agg(t order by t.created_at,t.id) from public.tasks t),'[]'),
  'requests',coalesce((select jsonb_agg(r order by r.created_at,r.id) from public.deadline_requests r),'[]'),
  'events',coalesce((select jsonb_agg(e order by e.created_at,e.id) from public.task_events e),'[]'),
  'comments',coalesce((select jsonb_agg(c order by c.created_at,c.id) from public.task_comments c),'[]'),
  'notifications',coalesce((select jsonb_agg(n order by n.created_at,n.id) from public.notifications n),'[]'),
  'serverNow',now()
 );$$;
commit;
