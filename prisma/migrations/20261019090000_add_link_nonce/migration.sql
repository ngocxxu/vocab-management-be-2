-- CreateTable
CREATE TABLE "link_nonce" (
    "id" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "link_nonce_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "link_nonce_nonce_key" ON "link_nonce"("nonce");

-- CreateIndex
CREATE INDEX "link_nonce_user_id_idx" ON "link_nonce"("user_id");

-- CreateIndex
CREATE INDEX "link_nonce_expires_at_idx" ON "link_nonce"("expires_at");

-- AddForeignKey
ALTER TABLE "link_nonce" ADD CONSTRAINT "link_nonce_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
