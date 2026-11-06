CREATE TABLE `goals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`target_amount_cents` integer NOT NULL,
	`target_date` text NOT NULL,
	`set_aside_cents` integer DEFAULT 0 NOT NULL,
	`planned_monthly_cents` integer,
	`expected_annual_return_bps` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
