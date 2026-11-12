CREATE TABLE `recurring_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`amount_varies` integer DEFAULT false NOT NULL,
	`match_text` text,
	`category_id` integer,
	`asset_id` integer,
	`link_cash` integer DEFAULT false NOT NULL,
	`note` text,
	`cadence` text NOT NULL,
	`anchor_on` text NOT NULL,
	`end_on` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "recurring_templates_kind_ck" CHECK(`kind` IN ('expense', 'income')),
	CONSTRAINT "recurring_templates_cadence_ck" CHECK(`cadence` IN ('monthly', 'yearly', 'weekly')),
	CONSTRAINT "recurring_templates_amount_ck" CHECK(`amount_cents` > 0)
);
--> statement-breakpoint
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
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`linked_snapshot_id`) REFERENCES `value_snapshots`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`recurring_template_id`) REFERENCES `recurring_templates`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_expenses`("id", "amount_cents", "occurred_on", "category_id", "asset_id", "linked_snapshot_id", "note", "created_at", "updated_at") SELECT "id", "amount_cents", "occurred_on", "category_id", "asset_id", "linked_snapshot_id", "note", "created_at", "updated_at" FROM `expenses`;--> statement-breakpoint
DROP TABLE `expenses`;--> statement-breakpoint
ALTER TABLE `__new_expenses` RENAME TO `expenses`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `expenses_occurred_on_idx` ON `expenses` (`occurred_on`);--> statement-breakpoint
CREATE INDEX `expenses_category_id_idx` ON `expenses` (`category_id`);--> statement-breakpoint
CREATE INDEX `expenses_asset_id_idx` ON `expenses` (`asset_id`);--> statement-breakpoint
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
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`linked_snapshot_id`) REFERENCES `value_snapshots`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`recurring_template_id`) REFERENCES `recurring_templates`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_incomes`("id", "amount_cents", "occurred_on", "category_id", "asset_id", "linked_snapshot_id", "note", "created_at", "updated_at") SELECT "id", "amount_cents", "occurred_on", "category_id", "asset_id", "linked_snapshot_id", "note", "created_at", "updated_at" FROM `incomes`;--> statement-breakpoint
DROP TABLE `incomes`;--> statement-breakpoint
ALTER TABLE `__new_incomes` RENAME TO `incomes`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `incomes_occurred_on_idx` ON `incomes` (`occurred_on`);--> statement-breakpoint
CREATE INDEX `incomes_category_id_idx` ON `incomes` (`category_id`);--> statement-breakpoint
CREATE INDEX `incomes_asset_id_idx` ON `incomes` (`asset_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `incomes_recurring_period_idx` ON `incomes` (`recurring_template_id`,`recurring_period`);
