ALTER TABLE "decks" ADD COLUMN "kind" text DEFAULT 'derived' NOT NULL;
ALTER TABLE "decks" ADD COLUMN "definition_id" text;

CREATE TABLE "settings_v2" (
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "settings_v2_user_id_key_pk" PRIMARY KEY("user_id", "key")
);
INSERT INTO "settings_v2" ("user_id", "key", "value", "updated_at")
SELECT "user_id", '__legacy__', "payload"::text, "updated_at" FROM "settings";
DROP TABLE "settings";
ALTER TABLE "settings_v2" RENAME TO "settings";
ALTER TABLE "settings" ADD CONSTRAINT "settings_user_id_user_id_fk"
	FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "settings_user_id_idx" ON "settings" USING btree ("user_id");
