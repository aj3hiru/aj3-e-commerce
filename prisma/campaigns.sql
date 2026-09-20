-- Campaign Offer 2 — creates THREE NEW tables. Nothing existing is changed or dropped.
-- Use this instead of `npx prisma db push` if you would rather run the SQL yourself
-- (phpMyAdmin, or `mysql -u USER -p DATABASE < prisma/campaigns.sql`).
-- Afterwards run `npx prisma generate`, then build and restart as usual.
-- Safe to run twice: every statement checks first (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS `ecom_campaigns` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(150) NOT NULL,
  `scope` VARCHAR(20) NOT NULL,
  `discount_type` VARCHAR(20) NOT NULL,
  `discount_value` DECIMAL(10, 2) NULL,
  `starts_at` DATETIME(3) NULL,
  `ends_at` DATETIME(3) NULL,
  `is_paused` BOOLEAN NOT NULL DEFAULT false,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `ecom_campaigns_is_paused_starts_at_ends_at_idx`(`is_paused`, `starts_at`, `ends_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ecom_campaign_targets` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `campaign_id` INT NOT NULL,
  `target_type` VARCHAR(20) NOT NULL,
  `target_id` INT NOT NULL,
  `fixed_price` DECIMAL(10, 2) NULL,
  INDEX `ecom_campaign_targets_campaign_id_idx`(`campaign_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `ecom_campaign_targets_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `ecom_campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ecom_campaign_sales` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `campaign_id` INT NOT NULL,
  `order_id` INT NOT NULL,
  `order_item_id` INT NOT NULL,
  `product_id` INT NOT NULL,
  `qty` INT NOT NULL,
  `unit_price` DECIMAL(10, 2) NOT NULL,
  `discount_per_unit` DECIMAL(10, 2) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `ecom_campaign_sales_order_item_id_key`(`order_item_id`),
  INDEX `ecom_campaign_sales_campaign_id_idx`(`campaign_id`),
  INDEX `ecom_campaign_sales_order_id_idx`(`order_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `ecom_campaign_sales_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `ecom_campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
