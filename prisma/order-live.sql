-- Web push: remember which shopper a browser belongs to, so order status updates reach them.
ALTER TABLE push_subscriptions ADD COLUMN customer_id INT NULL, ADD INDEX push_subscriptions_customer_id_idx (customer_id);
-- Live order feed for the admin and staff app reads ecom_order_events by id.
