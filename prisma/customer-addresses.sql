-- Saved customer addresses + pinned delivery location on orders.
-- Additive only. Run once:
--   npx prisma db execute --file prisma/customer-addresses.sql --schema prisma/schema.prisma
CREATE TABLE IF NOT EXISTS `ecom_customer_addresses` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `customer_id` INT NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `phone` VARCHAR(20) NOT NULL,
  `pincode` VARCHAR(10) NOT NULL,
  `state` VARCHAR(60) NOT NULL,
  `city` VARCHAR(80) NOT NULL,
  `house` VARCHAR(200) NOT NULL,
  `area` VARCHAR(200) NOT NULL,
  `landmark` VARCHAR(150) NULL,
  `type` VARCHAR(10) NOT NULL DEFAULT 'home',
  `lat` DECIMAL(10, 7) NULL,
  `lng` DECIMAL(10, 7) NULL,
  `is_default` BOOLEAN NOT NULL DEFAULT false,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `ecom_customer_addresses_customer_id_idx` (`customer_id`),
  CONSTRAINT `ecom_customer_addresses_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `ecom_customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ecom_orders`
  ADD COLUMN `shipping_lat` DECIMAL(10, 7) NULL,
  ADD COLUMN `shipping_lng` DECIMAL(10, 7) NULL;
