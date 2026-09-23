-- Payment Settings 2 — adds ONE new optional column to ecom_payment_settings.
-- Nothing existing is changed or dropped: every method already in the table
-- gets is_default = 0 (no default set yet), and every page that reads
-- payment settings today (including the original /payment-settings page)
-- carries on working unchanged.
--
-- Run it with either:
--   npx prisma db execute --file prisma/payment-settings2.sql --schema prisma/schema.prisma
-- or by pasting it into phpMyAdmin.
--
-- MySQL has no "ADD COLUMN IF NOT EXISTS", so run this once. If it answers
-- "Duplicate column name", the column is already there and nothing is wrong.

ALTER TABLE `ecom_payment_settings`
  ADD COLUMN `is_default` BOOLEAN NOT NULL DEFAULT false;
