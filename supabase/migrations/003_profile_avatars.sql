begin;
alter table public.profiles add column avatar_id text
 check (avatar_id in ('noir-1','noir-2','noir-3','noir-4','noir-5'));
create function public.set_avatar(selected_avatar text) returns text
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Войдите в аккаунт';end if;
 if selected_avatar is not null and selected_avatar not in ('noir-1','noir-2','noir-3','noir-4','noir-5') then
  raise exception 'Выберите аватар из списка';
 end if;
 update public.profiles set avatar_id=selected_avatar where id=auth.uid();
 if not found then raise exception 'Профиль недоступен';end if;
 return selected_avatar;
end;$$;
revoke all on function public.set_avatar(text) from public,anon;
grant execute on function public.set_avatar(text) to authenticated;
commit;
