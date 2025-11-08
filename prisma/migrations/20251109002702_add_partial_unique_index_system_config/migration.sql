-- CreatePartialUniqueIndex
-- This ensures only one SYSTEM config exists per key when userId IS NULL
-- PostgreSQL treats NULL != NULL in unique constraints, so we need a partial index
CREATE UNIQUE INDEX "config_system_key_unique" ON "config"("scope", "key") 
WHERE "scope" = 'SYSTEM' AND "user_id" IS NULL;

