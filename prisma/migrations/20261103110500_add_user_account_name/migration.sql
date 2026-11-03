-- Preserve any existing registrations while making account_name required for
-- all records created or updated by the application after this migration.
ALTER TABLE "users"
ADD COLUMN "account_name" VARCHAR(100) NOT NULL DEFAULT '';

ALTER TABLE "users"
ALTER COLUMN "account_name" DROP DEFAULT;
