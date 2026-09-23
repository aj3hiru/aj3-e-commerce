-- Categories 2 — adds ONE new optional column to ecom_categories.
-- Nothing existing is changed or dropped: every category already in the
-- table gets NULL in the new column until it's next saved, and every page
-- that reads categories today (including the original /categories page)
-- carries on working unchanged.
--
-- Run it with either:
--   npx prisma db execute --file prisma/categories2.sql --schema prisma/schema.prisma
-- or by pasting it into phpMyAdmin.
--
-- MySQL has no "ADD COLUMN IF NOT EXISTS", so run this once. If it answers
-- "Duplicate column name", the column is already there and nothing is wrong.

ALTER TABLE `ecom_categories`
  ADD COLUMN `updated_at` DATETIME(3) NULL;
