CREATE TABLE `exit_suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`request_hash` text NOT NULL,
	`status` text NOT NULL,
	`result` text,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `exit_suggestions_owner_created_idx` ON `exit_suggestions` (`owner`,`created_at`);--> statement-breakpoint
ALTER TABLE `orders` ADD `cost_basis` integer;--> statement-breakpoint
ALTER TABLE `positions` ADD `exit_state` text;