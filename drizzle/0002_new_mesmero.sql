CREATE TABLE `map_inbox_deletions` (
	`id` text PRIMARY KEY NOT NULL,
	`inbox_version` integer NOT NULL,
	`item_index` integer NOT NULL,
	`item` text NOT NULL,
	`inbox_backup` text NOT NULL,
	`created_at` text NOT NULL,
	`restore_inbox_version` integer,
	`restored_at` text
);
