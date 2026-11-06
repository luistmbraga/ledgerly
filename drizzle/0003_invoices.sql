CREATE TABLE `invoices` (
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
	FOREIGN KEY (`linked_income_id`) REFERENCES `incomes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`linked_expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `invoices_status_idx` ON `invoices` (`status`);--> statement-breakpoint
CREATE INDEX `invoices_due_on_idx` ON `invoices` (`due_on`);