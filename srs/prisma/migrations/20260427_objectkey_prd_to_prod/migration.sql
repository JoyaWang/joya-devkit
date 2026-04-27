-- Migration: Normalize objectKey env prefix from prd → prod
-- All InfoV objects stored before env rename still carry `infov/prd/` prefix.
-- This one-time migration aligns them with the canonical `infov/prod/` convention.

UPDATE "object"
SET "objectKey" = REPLACE("objectKey", 'infov/prd/', 'infov/prod/')
WHERE "objectKey" LIKE 'infov/prd/%';
