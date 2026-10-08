CREATE TABLE `study_fields` (
	`vault_id` text NOT NULL,
	`card_id` text NOT NULL,
	`field` text NOT NULL,
	`value` text NOT NULL,
	`version` integer NOT NULL,
	`updated_at` text NOT NULL,
	`op_id` text NOT NULL,
	PRIMARY KEY(`vault_id`, `card_id`, `field`),
	FOREIGN KEY (`vault_id`) REFERENCES `sync_vaults`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sync_rate_limits` (
	`scope_key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`hits` integer NOT NULL,
	`request_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_vaults` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`role` text DEFAULT 'learner' NOT NULL,
	`display_id` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_vaults_token_hash_unique` ON `sync_vaults` (`token_hash`);