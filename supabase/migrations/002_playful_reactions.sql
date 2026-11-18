begin;
alter table public.profiles add column playful_reactions boolean not null default false;
-- No user id or role is accepted: this function changes only the caller's preference.
create function public.set_playful_reactions(enabled boolean) returns boolean
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Войдите в аккаунт';end if;
 if enabled is null then raise exception 'Укажите ON или OFF';end if;
 update public.profiles set playful_reactions=enabled where id=auth.uid();
 if not found then raise exception 'Профиль недоступен';end if;
 return enabled;
end;$$;
revoke all on function public.set_playful_reactions(boolean) from public,anon;
grant execute on function public.set_playful_reactions(boolean) to authenticated;
commit;
