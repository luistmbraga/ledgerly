CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`display_currency` text DEFAULT 'EUR' NOT NULL,
	`emergency_fund_target_months` integer DEFAULT 6 NOT NULL,
	`essential_monthly_spend_override_cents` integer,
	`personality_revealed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
