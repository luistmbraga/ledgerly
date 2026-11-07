CREATE INDEX `goals_target_date_idx` ON `goals` (`target_date`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_assets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`is_liquid` integer DEFAULT false NOT NULL,
	`include_in_allocation` integer DEFAULT true NOT NULL,
	`cash_pct` integer DEFAULT 0 NOT NULL,
	`bonds_pct` integer DEFAULT 0 NOT NULL,
	`equities_pct` integer DEFAULT 0 NOT NULL,
	`other_pct` integer DEFAULT 100 NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "assets_sleeves_ck" CHECK(`cash_pct` + `bonds_pct` + `equities_pct` + `other_pct` = 100)
);
--> statement-breakpoint
INSERT INTO `__new_assets`("id", "type", "name", "is_liquid", "include_in_allocation", "cash_pct", "bonds_pct", "equities_pct", "other_pct", "notes", "created_at", "updated_at") SELECT "id", "type", "name", "is_liquid", "include_in_allocation", "cash_pct", "bonds_pct", "equities_pct", "other_pct", "notes", "created_at", "updated_at" FROM `assets`;--> statement-breakpoint
DROP TABLE `assets`;--> statement-breakpoint
ALTER TABLE `__new_assets` RENAME TO `assets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `assets_type_idx` ON `assets` (`type`);--> statement-breakpoint
CREATE TABLE `__new_value_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`asset_id` integer,
	`liability_id` integer,
	`recorded_on` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`liability_id`) REFERENCES `liabilities`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "value_snapshots_xor_ck" CHECK((`asset_id` IS NULL) != (`liability_id` IS NULL)),
	CONSTRAINT "value_snapshots_amount_ck" CHECK(`amount_cents` >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_value_snapshots`("id", "asset_id", "liability_id", "recorded_on", "amount_cents", "note", "created_at") SELECT "id", "asset_id", "liability_id", "recorded_on", "amount_cents", "note", "created_at" FROM `value_snapshots`;--> statement-breakpoint
DROP TABLE `value_snapshots`;--> statement-breakpoint
ALTER TABLE `__new_value_snapshots` RENAME TO `value_snapshots`;--> statement-breakpoint
CREATE INDEX `value_snapshots_asset_id_recorded_on_idx` ON `value_snapshots` (`asset_id`,`recorded_on`);--> statement-breakpoint
CREATE INDEX `value_snapshots_liability_id_recorded_on_idx` ON `value_snapshots` (`liability_id`,`recorded_on`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_expenses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`amount_cents` integer NOT NULL,
	`occurred_on` text NOT NULL,
	`category_id` integer,
	`asset_id` integer,
	`linked_snapshot_id` integer,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`linked_snapshot_id`) REFERENCES `value_snapshots`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_expenses`("id", "amount_cents", "occurred_on", "category_id", "asset_id", "linked_snapshot_id", "note", "created_at", "updated_at") SELECT "id", "amount_cents", "occurred_on", "category_id", "asset_id", "linked_snapshot_id", "note", "created_at", "updated_at" FROM `expenses`;--> statement-breakpoint
DROP TABLE `expenses`;--> statement-breakpoint
ALTER TABLE `__new_expenses` RENAME TO `expenses`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `expenses_occurred_on_idx` ON `expenses` (`occurred_on`);--> statement-breakpoint
CREATE INDEX `expenses_category_id_idx` ON `expenses` (`category_id`);--> statement-breakpoint
CREATE INDEX `expenses_asset_id_idx` ON `expenses` (`asset_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_incomes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`amount_cents` integer NOT NULL,
	`occurred_on` text NOT NULL,
	`category_id` integer,
	`asset_id` integer,
	`linked_snapshot_id` integer,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`linked_snapshot_id`) REFERENCES `value_snapshots`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_incomes`("id", "amount_cents", "occurred_on", "category_id", "asset_id", "linked_snapshot_id", "note", "created_at", "updated_at") SELECT "id", "amount_cents", "occurred_on", "category_id", "asset_id", "linked_snapshot_id", "note", "created_at", "updated_at" FROM `incomes`;--> statement-breakpoint
DROP TABLE `incomes`;--> statement-breakpoint
ALTER TABLE `__new_incomes` RENAME TO `incomes`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `incomes_occurred_on_idx` ON `incomes` (`occurred_on`);--> statement-breakpoint
CREATE INDEX `incomes_category_id_idx` ON `incomes` (`category_id`);--> statement-breakpoint
CREATE INDEX `incomes_asset_id_idx` ON `incomes` (`asset_id`);