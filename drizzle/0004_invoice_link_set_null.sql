PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_invoices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`direction` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`due_on` text,
	`status` text NOT NULL,
	`counterparty` text,
	`note` text,
	`paid_at` text,
	`linked_income_id` integer,
	`linked_expense_id` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`linked_income_id`) REFERENCES `incomes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`linked_expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_invoices`("id", "direction", "amount_cents", "due_on", "status", "counterparty", "note", "paid_at", "linked_income_id", "linked_expense_id", "created_at", "updated_at") SELECT "id", "direction", "amount_cents", "due_on", "status", "counterparty", "note", "paid_at", "linked_income_id", "linked_expense_id", "created_at", "updated_at" FROM `invoices`;--> statement-breakpoint
DROP TABLE `invoices`;--> statement-breakpoint
ALTER TABLE `__new_invoices` RENAME TO `invoices`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `invoices_status_idx` ON `invoices` (`status`);--> statement-breakpoint
CREATE INDEX `invoices_due_on_idx` ON `invoices` (`due_on`);