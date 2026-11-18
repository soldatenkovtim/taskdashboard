begin;
alter table public.profiles add column last_visit_day date,
 add column visit_streak integer not null default 0 check (visit_streak>=0);
create function public.record_visit() returns jsonb
language plpgsql security definer set search_path=public as $$
declare p public.profiles; today date := (now() at time zone 'Europe/Moscow')::date; streak integer;
begin
 if auth.uid() is null then raise exception 'Войдите в аккаунт';end if;
 select * into p from public.profiles where id=auth.uid() for update;
 if not found or p.access_status<>'active' then raise exception 'Нет доступа';end if;
 if p.last_visit_day >= today then
  return jsonb_build_object('days',p.visit_streak,'reward',false);
 end if;
 streak := case when p.last_visit_day=today-1 then p.visit_streak+1 else 1 end;
 update public.profiles set last_visit_day=today,visit_streak=streak where id=p.id;
 return jsonb_build_object('days',streak,'reward',streak=8);
end;$$;
revoke all on function public.record_visit() from public,anon;
grant execute on function public.record_visit() to authenticated;
commit;
