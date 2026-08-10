-- Agenda Pro — fixture mínima para restore drill (CI / local).
-- NÃO é backup de produção.

SET client_encoding = 'UTF8';

DROP TABLE IF EXISTS drill_smoke;
CREATE TABLE drill_smoke (
  id serial PRIMARY KEY,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO drill_smoke (note) VALUES ('restore-drill-ok');
