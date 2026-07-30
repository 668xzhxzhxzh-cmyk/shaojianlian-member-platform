CREATE TABLE `member_wecom_bindings` (
	`member_id` text PRIMARY KEY NOT NULL,
	`external_userid` text,
	`coach_userid` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_wecom_bindings_external_userid_unique` ON `member_wecom_bindings` (`external_userid`);--> statement-breakpoint
CREATE TABLE `wecom_send_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`external_userid` text NOT NULL,
	`coach_userid` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`wecom_msgid` text,
	`provider_message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`confirmed_at` text,
	`provider_updated_at` text
);
