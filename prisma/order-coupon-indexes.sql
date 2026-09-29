-- The coupon an order used: shown to staff, and its use is given back when the order is cancelled.
ALTER TABLE ecom_orders ADD COLUMN coupon_code VARCHAR(50) NULL;
-- Faster lists and reports as orders grow: by date, and by status + date; store pages list active products.
CREATE INDEX ecom_orders_created_at_idx ON ecom_orders (created_at);
CREATE INDEX ecom_orders_status_created_idx ON ecom_orders (order_status, created_at);
CREATE INDEX ecom_products_status_idx ON ecom_products (status);
