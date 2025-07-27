ALTER TABLE "mail0_connection" ALTER COLUMN "scope" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mail0_connection" ALTER COLUMN "expires_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mail0_connection" ADD COLUMN "imap_host" text;--> statement-breakpoint
ALTER TABLE "mail0_connection" ADD COLUMN "imap_port" integer;--> statement-breakpoint
ALTER TABLE "mail0_connection" ADD COLUMN "imap_tls" boolean;--> statement-breakpoint
ALTER TABLE "mail0_connection" ADD COLUMN "smtp_host" text;--> statement-breakpoint
ALTER TABLE "mail0_connection" ADD COLUMN "smtp_port" integer;--> statement-breakpoint
ALTER TABLE "mail0_connection" ADD COLUMN "smtp_tls" boolean;--> statement-breakpoint
ALTER TABLE "mail0_connection" ADD COLUMN "encrypted_password" text;