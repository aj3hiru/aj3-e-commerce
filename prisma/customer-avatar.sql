-- Customer profile photo (admin → Customers → Edit profile).
ALTER TABLE ecom_customers ADD COLUMN avatar VARCHAR(255) NULL AFTER address;
