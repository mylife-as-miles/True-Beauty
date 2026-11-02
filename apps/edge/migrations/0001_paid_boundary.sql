-- Prototype schema only. Apply through the hosting migration workflow; never from a request.
CREATE TABLE tb_edge_budgets (
  budget_id TEXT PRIMARY KEY,
  usd_micro_used INTEGER NOT NULL DEFAULT 0 CHECK (usd_micro_used >= 0 AND usd_micro_used <= 5000000),
  credits_used INTEGER NOT NULL DEFAULT 0 CHECK (credits_used >= 0 AND credits_used <= 100)
);
--> statement-breakpoint
CREATE TABLE tb_edge_vouchers (
  token_hash TEXT PRIMARY KEY,
  budget_id TEXT NOT NULL,
  session_hash TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('reasoning','skin','hair','clothing')),
  quote_hash TEXT NOT NULL,
  usd_micro INTEGER NOT NULL CHECK (usd_micro >= 0 AND usd_micro <= 5000000),
  credits INTEGER NOT NULL CHECK (credits >= 0 AND credits <= 100),
  issued_ms INTEGER NOT NULL,
  expires_ms INTEGER NOT NULL,
  consumed_by TEXT
);
--> statement-breakpoint
CREATE TABLE tb_edge_reservations (
  reservation_id TEXT PRIMARY KEY,
  voucher_hash TEXT NOT NULL UNIQUE,
  budget_id TEXT NOT NULL,
  session_hash TEXT NOT NULL,
  operation TEXT NOT NULL,
  quote_hash TEXT NOT NULL,
  usd_micro INTEGER NOT NULL,
  credits INTEGER NOT NULL,
  created_ms INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER tb_edge_atomic_reservation BEFORE INSERT ON tb_edge_reservations
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM tb_edge_vouchers v
    WHERE v.token_hash = NEW.voucher_hash
      AND v.budget_id = NEW.budget_id
      AND v.session_hash = NEW.session_hash
      AND v.operation = NEW.operation
      AND v.quote_hash = NEW.quote_hash
      AND v.usd_micro = NEW.usd_micro
      AND v.credits = NEW.credits
      AND v.issued_ms <= NEW.created_ms
      AND v.expires_ms > NEW.created_ms
      AND v.consumed_by IS NULL
  ) THEN RAISE(ABORT, 'edge_voucher_invalid') END;

  INSERT INTO tb_edge_budgets (budget_id, usd_micro_used, credits_used)
    VALUES (NEW.budget_id, 0, 0) ON CONFLICT(budget_id) DO NOTHING;

  UPDATE tb_edge_budgets SET
    usd_micro_used = usd_micro_used + NEW.usd_micro,
    credits_used = credits_used + NEW.credits
    WHERE budget_id = NEW.budget_id
      AND usd_micro_used + NEW.usd_micro <= 5000000
      AND credits_used + NEW.credits <= 100;
  SELECT CASE WHEN changes() != 1 THEN RAISE(ABORT, 'edge_budget_exceeded') END;

  UPDATE tb_edge_vouchers SET consumed_by = NEW.reservation_id
    WHERE token_hash = NEW.voucher_hash AND consumed_by IS NULL;
  SELECT CASE WHEN changes() != 1 THEN RAISE(ABORT, 'edge_voucher_invalid') END;
END;
--> statement-breakpoint
CREATE INDEX tb_edge_voucher_expiry ON tb_edge_vouchers(expires_ms);
--> statement-breakpoint
CREATE INDEX tb_edge_reservation_owner ON tb_edge_reservations(session_hash);
