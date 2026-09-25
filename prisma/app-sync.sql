-- Staff app: every change the app sends carries an Idempotency-Key; the first
-- answer is kept here so a re-sent change (lost reply, offline replay) is applied once.
CREATE TABLE IF NOT EXISTS api_idempotency (
  idem_key   VARCHAR(80) NOT NULL PRIMARY KEY,
  status     SMALLINT NULL,
  body       MEDIUMTEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_api_idem_created (created_at)
);
