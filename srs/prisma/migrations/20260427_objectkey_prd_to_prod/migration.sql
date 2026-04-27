-- Migration: Normalize objectKey env prefix from prd → prod
-- All InfoV objects stored before env rename still carry `infov/prd/` prefix.
-- This one-time migration aligns them with the canonical `infov/prod/` convention.

UPDATE objects
SET object_key = REPLACE(object_key, 'infov/prd/', 'infov/prod/')
WHERE object_key LIKE 'infov/prd/%';
