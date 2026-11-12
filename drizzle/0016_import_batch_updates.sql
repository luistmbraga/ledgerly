CREATE TABLE `import_batch_updates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`batch_id` integer NOT NULL,
	`kind` text NOT NULL,
	`entry_id` integer NOT NULL,
	`previous_amount_cents` integer NOT NULL,
	`previous_occurred_on` text NOT NULL,
	`previous_fingerprint` text,
	FOREIGN KEY (`batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "import_batch_updates_kind_ck" CHECK(`kind` IN ('expense', 'income'))
);
--> statement-breakpoint
CREATE INDEX `import_batch_updates_batch_id_idx` ON `import_batch_updates` (`batch_id`);