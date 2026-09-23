-- Coupons 2 — adds THREE new optional columns to ecom_coupons.
-- Nothing existing is changed or dropped: every coupon already in the table
-- gets NULL starts_at/ends_at (meaning "no date window", same as its current
-- always-on behavior) and is_paused = 0, so every page that reads coupons
-- today (including the original /coupons page) carries on working unchanged.
--
-- Run it with either:
--   npx prisma db execute --file prisma/coupons2.sql --schema prisma/schema.prisma
-- or by pasting it into phpMyAdmin.
--
-- MySQL has no "ADD COLUMN IF NOT EXISTS", so run this once. If it answers
-- "Duplicate column name", the columns are already there and nothing is wrong.

ALTER TABLE `ecom_coupons`
  ADD COLUMN `starts_at` DATETIME(3) NULL,
  ADD COLUMN `ends_at` DATETIME(3) NULL,
  ADD COLUMN `is_paused` BOOLEAN NOT NULL DEFAULT false;
