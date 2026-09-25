-- Order workflow: delivery agent assignment, delivered / cancel details, and an order history table.
-- Additive only. Run once:
--   npx prisma db execute --file prisma/order-workflow.sql --schema prisma/schema.prisma
ALTER TABLE `ecom_orders`
  ADD COLUMN `delivery_agent_id` INT NULL,
  ADD COLUMN `assigned_at` DATETIME(3) NULL,
  ADD COLUMN `delivered_at` DATETIME(3) NULL,
  ADD COLUMN `cancel_reason` VARCHAR(255) NULL,
  ADD INDEX `ecom_orders_delivery_agent_id_idx` (`delivery_agent_id`),
  ADD CONSTRAINT `ecom_orders_delivery_agent_id_fkey` FOREIGN KEY (`delivery_agent_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS `ecom_order_events` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `order_id` INT NOT NULL,
  `type` VARCHAR(20) NOT NULL,
  `from_value` VARCHAR(60) NULL,
  `to_value` VARCHAR(60) NULL,
  `note` VARCHAR(500) NULL,
  `user_id` INT NULL,
  `actor_name` VARCHAR(100) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `ecom_order_events_order_id_idx` (`order_id`),
  CONSTRAINT `ecom_order_events_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `ecom_orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
