-- Sequin's own metadata store (accounts, sink/endpoint config) — separate from
-- vocab_db, which it only reads via logical replication.
--
-- Runs ONLY on first container start against a fresh volume, same as any
-- /docker-entrypoint-initdb.d script. If postgres_vol already exists from
-- before Sequin was added, this will NOT run — create it by hand instead:
--   docker compose exec postgres psql -U admin -d postgres -c "CREATE DATABASE sequin;"
CREATE DATABASE sequin;
