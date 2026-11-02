CREATE TABLE `tb_hosted_epochs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	CONSTRAINT "hosted_epoch_safe_integer" CHECK("tb_hosted_epochs"."id" > 0 AND "tb_hosted_epochs"."id" <= 9007199254740991)
);
