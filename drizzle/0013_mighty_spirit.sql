ALTER TABLE `orders` ADD `platform_profit_fee` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `fee_policy` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `positions` ADD `platform_realized` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `positions` ADD `platform_high_water` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `positions` ADD `platform_paid` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `theses` ADD `closed_at` integer;--> statement-breakpoint
ALTER TABLE `theses` ADD `archived_at` integer;