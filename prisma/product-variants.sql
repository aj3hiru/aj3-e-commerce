-- Product variants: pack quantity (with the existing unit) and a variant group
-- linking separate products that are sizes of each other.
ALTER TABLE ecom_products
  ADD COLUMN quantity DECIMAL(10,3) NULL AFTER unit,
  ADD COLUMN variant_group INT NULL AFTER quantity,
  ADD INDEX ecom_products_variant_group_idx (variant_group);
