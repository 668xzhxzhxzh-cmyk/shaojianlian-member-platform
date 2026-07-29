CREATE TABLE `ai_suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`coach_id` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`confirmed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `body_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`measured_at` text NOT NULL,
	`weight` real NOT NULL,
	`body_fat` real NOT NULL,
	`muscle` real NOT NULL,
	`waist` real NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`coach_id` text NOT NULL,
	`title` text NOT NULL,
	`starts_at` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`model` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `checkins` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`checkin_date` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`channel` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`status` text NOT NULL,
	`provider_message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `nutrition_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`meal_type` text NOT NULL,
	`food` text NOT NULL,
	`calories` integer NOT NULL,
	`protein` real NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`logged_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `portal_state` (
	`user_id` text PRIMARY KEY NOT NULL,
	`state_json` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`plan` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
