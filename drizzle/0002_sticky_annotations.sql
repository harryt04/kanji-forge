CREATE TABLE "sticky_annotations" (
	"user_id" text NOT NULL,
	"deck_id" text NOT NULL,
	"content_ref" text NOT NULL,
	"note" text NOT NULL,
	"tags" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "sticky_annotations_user_id_deck_id_content_ref_pk" PRIMARY KEY("user_id","deck_id","content_ref")
);
--> statement-breakpoint
ALTER TABLE "sticky_annotations" ADD CONSTRAINT "sticky_annotations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "sticky_annotations_user_id_idx" ON "sticky_annotations" USING btree ("user_id");
