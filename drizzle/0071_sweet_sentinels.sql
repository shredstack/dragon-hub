CREATE TABLE "account_link_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"relay_user_id" uuid NOT NULL,
	"target_email" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "account_link_requests_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "account_link_requests" ADD CONSTRAINT "account_link_requests_relay_user_id_users_id_fk" FOREIGN KEY ("relay_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_link_requests_relay_idx" ON "account_link_requests" USING btree ("relay_user_id");