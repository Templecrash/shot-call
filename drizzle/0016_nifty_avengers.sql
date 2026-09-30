CREATE TABLE `app_members` (
	`user_id` text PRIMARY KEY NOT NULL,
	`invited_by` text,
	`source` text NOT NULL,
	`joined_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `member_invites` (
	`code` text PRIMARY KEY NOT NULL,
	`inviter_id` text NOT NULL,
	`slot` integer NOT NULL,
	`claimed_by` text,
	`claimed_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_invites_inviter_slot` ON `member_invites` (`inviter_id`,`slot`);--> statement-breakpoint
CREATE UNIQUE INDEX `member_invites_claimed_by` ON `member_invites` (`claimed_by`);--> statement-breakpoint
CREATE TABLE `membership_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
