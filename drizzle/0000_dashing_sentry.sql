CREATE TABLE `tb_hosted_budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`credits_used` integer NOT NULL,
	`credits_limit` integer NOT NULL,
	`usd_micro_used` integer NOT NULL,
	`usd_micro_limit` integer NOT NULL,
	`initialized_at` integer NOT NULL,
	`initialized_by_hash` text NOT NULL,
	CONSTRAINT "hosted_budget_credit_bounds" CHECK("tb_hosted_budgets"."credits_used" >= 51 AND "tb_hosted_budgets"."credits_used" <= "tb_hosted_budgets"."credits_limit" AND "tb_hosted_budgets"."credits_limit" <= 100),
	CONSTRAINT "hosted_budget_usd_bounds" CHECK("tb_hosted_budgets"."usd_micro_used" >= 111000 AND "tb_hosted_budgets"."usd_micro_used" <= "tb_hosted_budgets"."usd_micro_limit" AND "tb_hosted_budgets"."usd_micro_limit" <= 5000000)
);
--> statement-breakpoint
CREATE TABLE `tb_hosted_quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_hash` text NOT NULL,
	`operation` text NOT NULL,
	`terms_hash` text NOT NULL,
	`credits` integer NOT NULL,
	`usd_micro` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`iv` text NOT NULL,
	`ciphertext` text NOT NULL,
	`consumed_by` text,
	`record_namespace` text,
	`continuation_expires_at` integer,
	`approved_at` integer,
	`approved_by_hash` text,
	`approval_expires_at` integer,
	`revoked_at` integer,
	`revoked_by_hash` text,
	CONSTRAINT "hosted_quote_units" CHECK("tb_hosted_quotes"."credits" >= 0 AND "tb_hosted_quotes"."credits" <= 100 AND "tb_hosted_quotes"."usd_micro" >= 0 AND "tb_hosted_quotes"."usd_micro" <= 5000000),
	CONSTRAINT "hosted_quote_operation" CHECK("tb_hosted_quotes"."operation" IN ('skin','hair','clothing','reasoning')),
	CONSTRAINT "hosted_quote_retention" CHECK("tb_hosted_quotes"."expires_at" <= "tb_hosted_quotes"."created_at" + 900000 AND "tb_hosted_quotes"."expires_at" > "tb_hosted_quotes"."created_at")
);
--> statement-breakpoint
CREATE INDEX `hosted_quotes_owner` ON `tb_hosted_quotes` (`owner_hash`,`expires_at`);--> statement-breakpoint
CREATE INDEX `hosted_quotes_pending` ON `tb_hosted_quotes` (`consumed_by`,`expires_at`);--> statement-breakpoint
CREATE TABLE `tb_hosted_rate_limits` (
	`key_hash` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL,
	CONSTRAINT "hosted_rate_count" CHECK("tb_hosted_rate_limits"."count" > 0)
);
--> statement-breakpoint
CREATE INDEX `hosted_rate_expiry` ON `tb_hosted_rate_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `tb_hosted_records` (
	`namespace` text NOT NULL,
	`id` text NOT NULL,
	`owner_hash` text NOT NULL,
	`revision` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`iv` text NOT NULL,
	`ciphertext` text NOT NULL,
	PRIMARY KEY(`namespace`, `id`),
	CONSTRAINT "hosted_record_revision" CHECK("tb_hosted_records"."revision" > 0),
	CONSTRAINT "hosted_record_retention" CHECK("tb_hosted_records"."expires_at" <= "tb_hosted_records"."created_at" + 900000 AND "tb_hosted_records"."expires_at" > "tb_hosted_records"."created_at")
);
--> statement-breakpoint
CREATE INDEX `hosted_records_owner` ON `tb_hosted_records` (`namespace`,`owner_hash`,`expires_at`);--> statement-breakpoint
CREATE INDEX `hosted_records_expiry` ON `tb_hosted_records` (`expires_at`);--> statement-breakpoint
CREATE TABLE `tb_hosted_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`quote_id` text NOT NULL,
	`owner_hash` text NOT NULL,
	`budget_id` text NOT NULL,
	`operation` text NOT NULL,
	`terms_hash` text NOT NULL,
	`credits` integer NOT NULL,
	`usd_micro` integer NOT NULL,
	`created_at` integer NOT NULL,
	`record_namespace` text NOT NULL,
	`record_id` text NOT NULL,
	`record_expires_at` integer NOT NULL,
	`operator_authorized` integer NOT NULL,
	CONSTRAINT "hosted_reservation_operator" CHECK("tb_hosted_reservations"."operator_authorized" IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hosted_reservation_quote_once` ON `tb_hosted_reservations` (`quote_id`);--> statement-breakpoint
CREATE INDEX `hosted_reservation_owner` ON `tb_hosted_reservations` (`owner_hash`,`record_expires_at`);
--> statement-breakpoint
-- Custom SQLite DDL appended before the initial migration is ever applied.
-- The caller inserts the encrypted record and reservation in one D1 batch transaction.
CREATE TRIGGER tb_hosted_consume_quote BEFORE INSERT ON tb_hosted_reservations
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM tb_hosted_quotes q WHERE q.id = NEW.quote_id
      AND q.owner_hash = NEW.owner_hash AND q.operation = NEW.operation
      AND q.terms_hash = NEW.terms_hash AND q.credits = NEW.credits AND q.usd_micro = NEW.usd_micro
      AND q.expires_at > NEW.created_at AND q.consumed_by IS NULL AND q.revoked_at IS NULL
      AND (NEW.operator_authorized = 1 OR (q.approved_at IS NOT NULL AND q.approval_expires_at > NEW.created_at))
  ) THEN RAISE(ABORT, 'hosted_quote_denied') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM tb_hosted_records r WHERE r.namespace = NEW.record_namespace AND r.id = NEW.record_id
      AND r.owner_hash = NEW.owner_hash AND r.expires_at = NEW.record_expires_at AND r.expires_at > NEW.created_at
      AND r.revision > 0
  ) THEN RAISE(ABORT, 'hosted_record_mismatch') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM tb_hosted_budgets b WHERE b.id = NEW.budget_id
  ) THEN RAISE(ABORT, 'hosted_budget_uninitialized') END;
  UPDATE tb_hosted_budgets SET credits_used = credits_used + NEW.credits, usd_micro_used = usd_micro_used + NEW.usd_micro
    WHERE id = NEW.budget_id AND credits_used + NEW.credits <= credits_limit
      AND usd_micro_used + NEW.usd_micro <= usd_micro_limit;
  SELECT CASE WHEN changes() != 1 THEN RAISE(ABORT, 'hosted_budget_exceeded') END;
  UPDATE tb_hosted_quotes SET consumed_by = NEW.record_id, record_namespace = NEW.record_namespace,
    continuation_expires_at = NEW.record_expires_at, approval_expires_at = NEW.record_expires_at,
    approved_at = COALESCE(approved_at, NEW.created_at),
    approved_by_hash = COALESCE(approved_by_hash, NEW.owner_hash)
    WHERE id = NEW.quote_id AND consumed_by IS NULL AND revoked_at IS NULL;
  SELECT CASE WHEN changes() != 1 THEN RAISE(ABORT, 'hosted_quote_denied') END;
END;
