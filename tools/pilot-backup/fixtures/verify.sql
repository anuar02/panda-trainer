DO $$
BEGIN
  IF (SELECT count(*) FROM som40_fixture.users) <> 2 OR
     (SELECT count(*) FROM som40_fixture.sessions) <> 3 THEN
    RAISE EXCEPTION 'fixture row count mismatch';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'som40_fixture.sessions'::regclass) THEN
    RAISE EXCEPTION 'RLS missing';
  END IF;
  IF NOT has_schema_privilege('som40_fixture_reader', 'som40_fixture', 'USAGE') OR
     NOT has_table_privilege('som40_fixture_reader', 'som40_fixture.sessions', 'SELECT') OR
     NOT has_function_privilege('som40_fixture_reader', 'som40_fixture.current_owner()', 'EXECUTE') THEN
    RAISE EXCEPTION 'fixture role grants missing';
  END IF;
  BEGIN
    INSERT INTO som40_fixture.sessions(owner_id, minutes) VALUES (999, 30);
    RAISE EXCEPTION 'foreign key missing';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO som40_fixture.sessions(owner_id, minutes) VALUES (1, 0);
    RAISE EXCEPTION 'check constraint missing';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO som40_fixture.users VALUES (1, 'duplicate@example.invalid');
    RAISE EXCEPTION 'primary key missing';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO som40_fixture.users VALUES (3, 'alice@example.invalid');
    RAISE EXCEPTION 'unique constraint missing';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END $$;
SET ROLE som40_fixture_reader;
SET som40.owner_id = '1';
DO $$ BEGIN
  IF som40_fixture.current_owner() <> 1 OR
     (SELECT count(*) FROM som40_fixture.sessions) <> 2 THEN
    RAISE EXCEPTION 'owner 1 RLS/function mismatch';
  END IF;
END $$;
SET som40.owner_id = '2';
DO $$ BEGIN
  IF (SELECT count(*) FROM som40_fixture.sessions) <> 1 THEN
    RAISE EXCEPTION 'owner 2 RLS mismatch';
  END IF;
END $$;
SET som40.owner_id = '';
DO $$ BEGIN
  IF (SELECT count(*) FROM som40_fixture.sessions) <> 0 THEN
    RAISE EXCEPTION 'anonymous RLS mismatch';
  END IF;
END $$;
RESET ROLE;
