CREATE TABLE `pnl_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`payload` text NOT NULL,
	`image_key` text NOT NULL,
	`created_at` integer NOT NULL
);
