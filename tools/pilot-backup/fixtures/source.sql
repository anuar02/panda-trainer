DROP SCHEMA IF EXISTS som40_fixture CASCADE;
CREATE SCHEMA som40_fixture;
CREATE TABLE som40_fixture.users (
  id integer PRIMARY KEY,
  email text NOT NULL UNIQUE CHECK (email LIKE '%@example.invalid')
);
CREATE TABLE som40_fixture.sessions (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id integer NOT NULL REFERENCES som40_fixture.users(id),
  minutes integer NOT NULL CHECK (minutes > 0)
);
INSERT INTO som40_fixture.users VALUES (1, 'alice@example.invalid'), (2, 'bob@example.invalid');
INSERT INTO som40_fixture.sessions(owner_id, minutes) VALUES (1, 30), (1, 45), (2, 60);
CREATE FUNCTION som40_fixture.current_owner() RETURNS integer
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('som40.owner_id', true), '')::integer $$;
ALTER TABLE som40_fixture.sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_sessions ON som40_fixture.sessions
  FOR SELECT TO som40_fixture_reader
  USING (owner_id = som40_fixture.current_owner());
GRANT USAGE ON SCHEMA som40_fixture TO som40_fixture_reader;
GRANT SELECT ON som40_fixture.sessions TO som40_fixture_reader;
GRANT EXECUTE ON FUNCTION som40_fixture.current_owner() TO som40_fixture_reader;
