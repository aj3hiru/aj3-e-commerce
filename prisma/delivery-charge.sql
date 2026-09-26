-- Business Settings → Delivery Charge: what each online order paid for delivery
-- (the rule itself lives in storefront_settings under the key "delivery").
ALTER TABLE ecom_orders ADD COLUMN delivery_charge DECIMAL(10,2) NOT NULL DEFAULT 0;
