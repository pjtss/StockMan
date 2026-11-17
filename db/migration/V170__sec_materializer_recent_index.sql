CREATE INDEX CONCURRENTLY IF NOT EXISTS sec_submissions_materialize_acceptance_idx
  ON sec_submissions (acceptance_datetime DESC, accession)
  WHERE acceptance_datetime ~ '^([0-9]{14}|[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?Z)$';
