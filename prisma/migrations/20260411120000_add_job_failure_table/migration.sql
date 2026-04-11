-- CreateTable
CREATE TABLE "job_failure" (
    "id" TEXT NOT NULL,
    "queue_name" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "job_name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "error" TEXT NOT NULL,
    "stack_trace" TEXT,
    "attempts_made" INTEGER NOT NULL,
    "max_attempts" INTEGER NOT NULL,
    "failed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_failure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_failure_queue_name_job_id_key" ON "job_failure"("queue_name", "job_id");

-- CreateIndex
CREATE INDEX "job_failure_queue_name_failed_at_idx" ON "job_failure"("queue_name", "failed_at");
