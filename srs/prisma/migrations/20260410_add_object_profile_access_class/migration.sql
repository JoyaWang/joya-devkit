-- Migration: Add object_profile and access_class to objects table
-- Created: 2026-04-10
-- Description: Adds object_profile and access_class columns to support storage/delivery policy routing
--   - object_profile: The semantic profile of the object (release_artifact, public_asset, public_media, private_media, private_document, internal_archive)
--   - access_class: The access classification (public-stable, private-signed, internal-signed)

-- Add object_profile column (nullable, for backward compatibility)
ALTER TABLE "objects" ADD COLUMN "object_profile" TEXT;

-- Add access_class column (nullable, for backward compatibility)
ALTER TABLE "objects" ADD COLUMN "access_class" TEXT;

-- Add comments for documentation
COMMENT ON COLUMN "objects"."object_profile" IS 'Semantic profile of the object: release_artifact, public_asset, public_media, private_media, private_document, internal_archive';
COMMENT ON COLUMN "objects"."access_class" IS 'Access classification: public-stable (stable public URL), private-signed (presigned URL), internal-signed (internal presigned URL)';
