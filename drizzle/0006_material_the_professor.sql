CREATE TABLE `people_follows` (
	`follower_id` text NOT NULL,
	`followee_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `people_follows_pair_idx` ON `people_follows` (`follower_id`,`followee_id`);--> statement-breakpoint
CREATE INDEX `people_follows_followee_idx` ON `people_follows` (`followee_id`);