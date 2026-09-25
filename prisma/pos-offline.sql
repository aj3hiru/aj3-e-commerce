-- Offline billing: each POS bill carries the id the till gave it, so a bill
-- that is uploaded twice (connection dropped mid-upload) is saved only once.
ALTER TABLE ecom_orders ADD COLUMN client_ref VARCHAR(64) NULL;
ALTER TABLE ecom_orders ADD UNIQUE KEY uq_ecom_orders_client_ref (client_ref);
