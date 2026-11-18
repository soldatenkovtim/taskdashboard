begin;
update public.profiles set playful_reactions=true;
alter table public.profiles alter column playful_reactions set default true;
alter table public.profiles add constraint reactions_always_on check (playful_reactions=true);
drop function public.set_playful_reactions(boolean);
commit;
