-- CreateTable
CREATE TABLE "user_fcm_token" (
    "user_id" TEXT NOT NULL,
    "fcm_token" TEXT NOT NULL,
    "device_type" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" TEXT,
    "updated_by" TEXT,
    "deleted_by" TEXT,

    CONSTRAINT "user_fcm_token_pkey" PRIMARY KEY ("user_id","fcm_token")
);

-- CreateIndex
CREATE INDEX "user_fcm_token_fcm_token_idx" ON "user_fcm_token"("fcm_token");

-- AddForeignKey
ALTER TABLE "user_fcm_token" ADD CONSTRAINT "user_fcm_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
