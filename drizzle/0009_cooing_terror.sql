ALTER TABLE `orders` ADD `execution_mode` text DEFAULT 'spot' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `leverage` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `execution_reason` text;--> statement-breakpoint
ALTER TABLE `positions` ADD `execution_mode` text DEFAULT 'spot' NOT NULL;--> statement-breakpoint
ALTER TABLE `positions` ADD `leverage` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `positions` ADD `perp_notional` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `positions` ADD `perp_weight` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `positions` ADD `maintenance_bps` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `positions` ADD `perp_markets` text;