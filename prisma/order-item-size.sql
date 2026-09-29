-- Which size (Sizes / Units row) an order line sold, so cancelling or deleting the order puts that size's stock back.
ALTER TABLE ecom_order_items ADD COLUMN size_id INT NULL;
