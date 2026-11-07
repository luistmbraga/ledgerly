ALTER TABLE `expenses` ADD `asset_id` integer REFERENCES assets(id);--> statement-breakpoint
ALTER TABLE `expenses` ADD `linked_snapshot_id` integer REFERENCES value_snapshots(id);--> statement-breakpoint
CREATE INDEX `expenses_asset_id_idx` ON `expenses` (`asset_id`);--> statement-breakpoint
ALTER TABLE `incomes` ADD `asset_id` integer REFERENCES assets(id);--> statement-breakpoint
ALTER TABLE `incomes` ADD `linked_snapshot_id` integer REFERENCES value_snapshots(id);--> statement-breakpoint
CREATE INDEX `incomes_occurred_on_idx` ON `incomes` (`occurred_on`);--> statement-breakpoint
CREATE INDEX `incomes_category_id_idx` ON `incomes` (`category_id`);--> statement-breakpoint
CREATE INDEX `incomes_asset_id_idx` ON `incomes` (`asset_id`);