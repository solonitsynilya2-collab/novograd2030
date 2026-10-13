CREATE TABLE `answers` (
	`id` text PRIMARY KEY NOT NULL,
	`player` text NOT NULL,
	`step` integer NOT NULL,
	`data` text NOT NULL,
	`updated` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `player_step` ON `answers` (`player`,`step`);--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`room` text NOT NULL,
	`name` text NOT NULL,
	`normalized` text NOT NULL,
	`team` text NOT NULL,
	`token` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_name` ON `players` (`room`,`normalized`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`step` integer DEFAULT 0 NOT NULL,
	`created` text NOT NULL
);
