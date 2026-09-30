CREATE TABLE `prediction_bets` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`user_id` text NOT NULL,
	`side` text NOT NULL,
	`amount` integer NOT NULL,
	`stake` integer NOT NULL,
	`fee` integer NOT NULL,
	`payout` integer,
	`request_key` text NOT NULL,
	`operation_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `prediction_bets_round` ON `prediction_bets` (`round_id`);--> statement-breakpoint
CREATE INDEX `prediction_bets_user` ON `prediction_bets` (`user_id`);--> statement-breakpoint
CREATE TABLE `prediction_rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`thesis_id` text NOT NULL,
	`days` integer NOT NULL,
	`sequence` integer NOT NULL,
	`thesis_version` integer NOT NULL,
	`title` text NOT NULL,
	`basket` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`outcome` text,
	`return_micropct` integer,
	`reason` text,
	`prices` text,
	`settlement_id` text,
	`settled_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prediction_round_sequence` ON `prediction_rounds` (`thesis_id`,`days`,`sequence`);--> statement-breakpoint
CREATE INDEX `prediction_round_due` ON `prediction_rounds` (`status`,`ends_at`);