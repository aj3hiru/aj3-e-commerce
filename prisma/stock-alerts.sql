-- "Notify me" on out-of-stock products: who asked (browser push endpoint and/or signed-in customer), sent once it is back.
CREATE TABLE IF NOT EXISTS ecom_stock_alerts (
  id INT NOT NULL AUTO_INCREMENT,
  product_id INT NOT NULL,
  size_id INT NULL,
  endpoint VARCHAR(768) NULL,
  customer_id INT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  notified_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  INDEX ecom_stock_alerts_pending_idx (notified_at, product_id),
  INDEX ecom_stock_alerts_product_idx (product_id)
);
