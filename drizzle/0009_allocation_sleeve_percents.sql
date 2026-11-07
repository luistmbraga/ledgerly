ALTER TABLE `assets` ADD `cash_pct` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `assets` ADD `bonds_pct` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `assets` ADD `equities_pct` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `assets` ADD `other_pct` integer DEFAULT 100 NOT NULL;--> statement-breakpoint
UPDATE `assets` SET
  `cash_pct` = CASE WHEN `allocation_bucket` = 'cash' THEN 100 ELSE 0 END,
  `bonds_pct` = CASE WHEN `allocation_bucket` = 'bonds' THEN 100 ELSE 0 END,
  `equities_pct` = CASE WHEN `allocation_bucket` = 'equities' THEN 100 ELSE 0 END,
  `other_pct` = CASE WHEN `allocation_bucket` = 'other' THEN 100 ELSE 0 END;--> statement-breakpoint
ALTER TABLE `assets` DROP COLUMN `allocation_bucket`;
