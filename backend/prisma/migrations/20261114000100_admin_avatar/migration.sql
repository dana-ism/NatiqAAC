-- Optional private Admin avatar reference. Existing accounts remain unchanged.
ALTER TABLE "users" ADD COLUMN "avatar_key" TEXT;
