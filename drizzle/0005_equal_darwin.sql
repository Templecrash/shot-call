CREATE TABLE `evidence_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`thesis_id` text NOT NULL,
	`fingerprint` text NOT NULL,
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
CREATE INDEX `evidence_thesis_idx` ON `evidence_reports` (`thesis_id`,`fingerprint`,`created_at`);--> statement-breakpoint
CREATE INDEX `evidence_owner_idx` ON `evidence_reports` (`owner`,`created_at`);