CREATE TABLE `accounts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`balance` integer DEFAULT 1000000 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`thesis_id` text NOT NULL,
	`side` text NOT NULL,
	`amount` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `orders_user_idx` ON `orders` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `positions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`thesis_id` text NOT NULL,
	`amount` integer NOT NULL,
	`invested` integer NOT NULL,
	`take_profit` integer,
	`stop_loss` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `positions_user_thesis` ON `positions` (`user_id`,`thesis_id`);--> statement-breakpoint
CREATE TABLE `theses` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `theses_owner_idx` ON `theses` (`owner`);--> statement-breakpoint
CREATE INDEX `theses_created_idx` ON `theses` (`created_at`);