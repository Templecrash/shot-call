CREATE TABLE `take_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`thesis_id` text NOT NULL,
	`body` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`prompt` text,
	`status` text NOT NULL,
	`image_key` text,
	`error` text,
	`request_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `take_identity_owner_idx` ON `take_identities` (`owner`,`created_at`);--> statement-breakpoint
ALTER TABLE `theses` ADD `visibility` text DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE `theses` ADD `artwork_id` text;