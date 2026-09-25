-- Staff profile fields: first / last name, mobile (login), profile photo. Additive only. Run once:
--   npx prisma db execute --file prisma/staff-profile.sql --schema prisma/schema.prisma
ALTER TABLE `users`
  ADD COLUMN `first_name` VARCHAR(60) NULL,
  ADD COLUMN `last_name` VARCHAR(60) NULL,
  ADD COLUMN `phone` VARCHAR(20) NULL,
  ADD COLUMN `avatar` VARCHAR(255) NULL,
  ADD UNIQUE INDEX `users_phone_key` (`phone`);
