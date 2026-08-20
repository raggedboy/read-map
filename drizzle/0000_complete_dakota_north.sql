CREATE TABLE `map_documents` (
	`path` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`content` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `resources` (
	`path` text PRIMARY KEY NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`updated_at` text NOT NULL
);
