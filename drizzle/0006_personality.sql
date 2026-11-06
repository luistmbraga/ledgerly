CREATE TABLE `investor_profiles` (
	`id` integer PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`risk_score` integer NOT NULL,
	`horizon_score` integer NOT NULL,
	`experience_score` integer NOT NULL,
	`liquidity_score` integer NOT NULL,
	`completed_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `personality_answers` (
	`question_key` text PRIMARY KEY NOT NULL,
	`option_id` text NOT NULL,
	`updated_at` text NOT NULL
);
