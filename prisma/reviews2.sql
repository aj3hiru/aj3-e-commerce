-- Product Reviews 2 — adds THREE NEW optional columns to ecom_product_reviews.
-- Nothing existing is changed or dropped: every review already in the table
-- simply keeps NULL in the new columns, and every page that reads reviews
-- today carries on working.
--
-- Run it with either:
--   npx prisma db execute --file prisma/reviews2.sql --schema prisma/schema.prisma
-- or by pasting it into phpMyAdmin.
--
-- MySQL has no "ADD COLUMN IF NOT EXISTS", so run this once. If it answers
-- "Duplicate column name", the columns are already there and nothing is wrong.

-- ─────────────────────────────────────────────────────────────────────────
-- Product Reviews 2 — three NEW optional columns on ecom_product_reviews.
-- Existing rows keep NULL; nothing that reads reviews today is affected.
-- MySQL has no "ADD COLUMN IF NOT EXISTS", so run this part only once. If it
-- says "Duplicate column name", the column is already there and you can ignore it.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE `ecom_product_reviews`
  ADD COLUMN `customer_id` INT NULL,
  ADD COLUMN `customer_phone` VARCHAR(20) NULL,
  ADD COLUMN `order_id` INT NULL,
  ADD INDEX `ecom_product_reviews_customer_id_idx` (`customer_id`),
  ADD INDEX `ecom_product_reviews_order_id_idx` (`order_id`);
