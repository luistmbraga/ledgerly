ALTER TABLE `assets` ADD `allocation_bucket` text DEFAULT 'other' NOT NULL;--> statement-breakpoint
UPDATE `assets` SET `allocation_bucket` = CASE
  WHEN `type` IN ('cash', 'receivable') THEN 'cash'
  WHEN `type` IN ('brokerage', 'retirement') THEN 'equities'
  ELSE 'other'
END;