-- Storefront settings (menus, menu design, push bell/prompt, footer) — one
-- NEW table; nothing existing is changed. Safe to run twice.
--   npx prisma db execute --file prisma/storefront-settings.sql --schema prisma/schema.prisma
CREATE TABLE IF NOT EXISTS `storefront_settings` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `key` VARCHAR(64) NOT NULL,
  `value` JSON NOT NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `storefront_settings_key_key` (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
