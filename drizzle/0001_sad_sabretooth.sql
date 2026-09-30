CREATE TABLE `generations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`prompt` text NOT NULL,
	`model` text NOT NULL,
	`status` text NOT NULL,
	`result` text,
	`provider_payload` text,
	`usage` text,
	`estimated_cost_cents` integer,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `generations_owner_created_idx` ON `generations` (`owner`,`created_at`);