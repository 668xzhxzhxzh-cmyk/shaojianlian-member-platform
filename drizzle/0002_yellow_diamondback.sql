CREATE TABLE `wecom_binding_links` (
	`state_token` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`coach_userid` text NOT NULL,
	`config_id` text NOT NULL,
	`qr_code` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`external_userid` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text
);
