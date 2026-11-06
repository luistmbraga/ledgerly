CREATE TABLE `ai_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task` text NOT NULL,
	`entity_id` text,
	`input_hash` text NOT NULL,
	`prompt_version` text NOT NULL,
	`output_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_results_task_entity_hash_idx` ON `ai_results` (`task`,`entity_id`,`input_hash`);