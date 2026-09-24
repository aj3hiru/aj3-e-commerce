-- Push Manager 2 — adds new optional columns to push_campaigns and
-- push_queue. Nothing existing is changed or dropped: every row already in
-- these tables gets NULL/0 defaults in the new columns, so anything that
-- reads these tables today keeps working unchanged.
--
-- Run it with either:
--   npx prisma db execute --file prisma/push-manager2.sql --schema prisma/schema.prisma
-- or by pasting it into phpMyAdmin.
--
-- MySQL has no "ADD COLUMN IF NOT EXISTS", so run this once. If it answers
-- "Duplicate column name", the columns are already there and nothing is wrong.

ALTER TABLE `push_campaigns`
  ADD COLUMN `post_id` INT NULL,
  ADD COLUMN `image` VARCHAR(255) NULL,
  ADD COLUMN `total_subscribers` INT NULL DEFAULT 0,
  ADD COLUMN `sent` INT NULL DEFAULT 0,
  ADD COLUMN `failed` INT NULL DEFAULT 0,
  ADD COLUMN `updated_at` DATETIME(3) NULL;

ALTER TABLE `push_queue`
  ADD COLUMN `attempts` INT NULL DEFAULT 0,
  ADD COLUMN `last_error` TEXT NULL;
