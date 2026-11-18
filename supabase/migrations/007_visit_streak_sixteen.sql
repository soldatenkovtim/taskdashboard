-- Return a one-time reaction at 16 days or on return after breaking a 16+ day streak.
begin;
create or replace function public.record_visit() returns jsonb
language plpgsql security definer set search_path=public as $$
declare p public.profiles; today date := (now() at time zone 'Europe/Moscow')::date; streak integer; reaction text;
begin
 if auth.uid() is null then raise exception 'Войдите в аккаунт';end if;
 select * into p from public.profiles where id=auth.uid() for update;
 if not found or p.access_status<>'active' then raise exception 'Нет доступа';end if;
 if p.last_visit_day >= today then
  return jsonb_build_object('days',p.visit_streak,'reward',false);
 end if;
 reaction := case when p.last_visit_day < today-1 and p.visit_streak >= 16 then 'visit_streak_broken' end;
 streak := case when p.last_visit_day=today-1 then p.visit_streak+1 else 1 end;
 update public.profiles set last_visit_day=today,visit_streak=streak where id=p.id;
 if streak=16 then reaction := 'visit_streak_16';end if;
 return jsonb_build_object('days',streak,'reward',streak=8,'reaction',reaction);
end;$$;
revoke all on function public.record_visit() from public,anon;
grant execute on function public.record_visit() to authenticated;
commit;
