begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(1);
select is_empty(
  $$select c.relname::text
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
       and not c.relrowsecurity
       and not exists (
         select 1 from pg_depend d
          where d.classid = 'pg_class'::regclass
            and d.objid = c.oid
            and d.deptype = 'e'
       )$$,
  'Every application table in public enables row level security'
);
select * from finish();
rollback;
