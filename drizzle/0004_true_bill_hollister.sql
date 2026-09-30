CREATE TABLE `creator_earnings` (
	`order_id` text PRIMARY KEY NOT NULL,
	`creator_id` text NOT NULL,
	`follower_id` text NOT NULL,
	`thesis_id` text NOT NULL,
	`amount` integer NOT NULL,
	`realized_profit` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `earnings_creator_idx` ON `creator_earnings` (`creator_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `thesis_follows` (
	`user_id` text NOT NULL,
	`thesis_id` text NOT NULL,
	`creator_id` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`accepted_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `follows_user_thesis_idx` ON `thesis_follows` (`user_id`,`thesis_id`);--> statement-breakpoint
CREATE INDEX `follows_creator_idx` ON `thesis_follows` (`creator_id`,`active`);--> statement-breakpoint
ALTER TABLE `orders` ADD `creator_fee` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `request_key` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `operation_id` text;--> statement-breakpoint
ALTER TABLE `positions` ADD `share_eligible` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `positions` ADD `share_creator` text;--> statement-breakpoint
ALTER TABLE `positions` ADD `share_realized` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `positions` ADD `share_high_water` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `positions` ADD `share_paid` integer DEFAULT 0 NOT NULL;