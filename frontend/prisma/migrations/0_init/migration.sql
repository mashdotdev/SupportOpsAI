CREATE TABLE "public"."support_tickets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "support_tickets_subject_check" CHECK (char_length(subject) BETWEEN 1 AND 200)
);

CREATE INDEX "support_tickets_user_created_idx"
    ON "public"."support_tickets"("user_id", "created_at" DESC);
