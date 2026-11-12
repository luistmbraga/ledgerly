CREATE TABLE `import_batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`parser_id` text NOT NULL,
	`file_name` text NOT NULL,
	`file_sha256` text NOT NULL,
	`period_from` text,
	`period_to` text,
	`closing_balance_cents` integer,
	`asset_id` integer,
	`link_mode` text NOT NULL,
	`closing_snapshot_id` integer,
	`row_count` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`closing_snapshot_id`) REFERENCES `value_snapshots`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "import_batches_link_mode_ck" CHECK(`link_mode` IN ('none', 'closing', 'per_row'))
);
--> statement-breakpoint
CREATE INDEX `import_batches_file_sha256_idx` ON `import_batches` (`file_sha256`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_expenses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`amount_cents` integer NOT NULL,
	`occurred_on` text NOT NULL,
	`category_id` integer,
	`asset_id` integer,
	`linked_snapshot_id` integer,
	`recurring_template_id` integer,
	`recurring_period` text,
	`import_batch_id` integer,
	`import_fingerprint` text,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`linked_snapshot_id`) REFERENCES `value_snapshots`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`recurring_template_id`) REFERENCES `recurring_templates`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`import_batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_expenses`("id", "amount_cents", "occurred_on", "category_id", "asset_id", "linked_snapshot_id", "recurring_template_id", "recurring_period", "note", "created_at", "updated_at") SELECT "id", "amount_cents", "occurred_on", "category_id", "asset_id", "linked_snapshot_id", "recurring_template_id", "recurring_period", "note", "created_at", "updated_at" FROM `expenses`;--> statement-breakpoint
DROP TABLE `expenses`;--> statement-breakpoint
ALTER TABLE `__new_expenses` RENAME TO `expenses`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `expenses_occurred_on_idx` ON `expenses` (`occurred_on`);--> statement-breakpoint
CREATE INDEX `expenses_category_id_idx` ON `expenses` (`category_id`);--> statement-breakpoint
CREATE INDEX `expenses_asset_id_idx` ON `expenses` (`asset_id`);--> statement-breakpoint
CREATE INDEX `expenses_import_fingerprint_idx` ON `expenses` (`import_fingerprint`);--> statement-breakpoint
CREATE UNIQUE INDEX `expenses_recurring_period_idx` ON `expenses` (`recurring_template_id`,`recurring_period`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_incomes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`amount_cents` integer NOT NULL,
	`occurred_on` text NOT NULL,
	`category_id` integer,
	`asset_id` integer,
	`linked_snapshot_id` integer,
	`recurring_template_id` integer,
	`recurring_period` text,
	`import_batch_id` integer,
	`import_fingerprint` text,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`linked_snapshot_id`) REFERENCES `value_snapshots`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`recurring_template_id`) REFERENCES `recurring_templates`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`import_batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_incomes`("id", "amount_cents", "occurred_on", "category_id", "asset_id", "linked_snapshot_id", "recurring_template_id", "recurring_period", "note", "created_at", "updated_at") SELECT "id", "amount_cents", "occurred_on", "category_id", "asset_id", "linked_snapshot_id", "recurring_template_id", "recurring_period", "note", "created_at", "updated_at" FROM `incomes`;--> statement-breakpoint
DROP TABLE `incomes`;--> statement-breakpoint
ALTER TABLE `__new_incomes` RENAME TO `incomes`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `incomes_occurred_on_idx` ON `incomes` (`occurred_on`);--> statement-breakpoint
CREATE INDEX `incomes_category_id_idx` ON `incomes` (`category_id`);--> statement-breakpoint
CREATE INDEX `incomes_asset_id_idx` ON `incomes` (`asset_id`);--> statement-breakpoint
CREATE INDEX `incomes_import_fingerprint_idx` ON `incomes` (`import_fingerprint`);--> statement-breakpoint
CREATE UNIQUE INDEX `incomes_recurring_period_idx` ON `incomes` (`recurring_template_id`,`recurring_period`);
