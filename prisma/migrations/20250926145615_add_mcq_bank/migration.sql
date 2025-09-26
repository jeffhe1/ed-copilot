/*
  Warnings:

  - A unique constraint covering the columns `[authUserId]` on the table `Student` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "public"."Area" AS ENUM ('Mathematical_Methods', 'Specialist_Mathematics', 'General_Mathematics', 'Foundation_Mathematics');

-- AlterTable
ALTER TABLE "public"."Student" ADD COLUMN     "authUserId" UUID,
ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text,
ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "public"."Mcq" (
    "id" TEXT NOT NULL,
    "area" "public"."Area" NOT NULL,
    "subject" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "stem_md" TEXT NOT NULL,
    "options_json" JSONB NOT NULL,
    "answer" VARCHAR(1) NOT NULL,
    "explanation_md" TEXT NOT NULL,
    "graph_json" JSONB,
    "skill_ids" TEXT[],
    "difficulty" INTEGER,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mcq_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Mcq_area_subject_topic_createdAt_idx" ON "public"."Mcq"("area", "subject", "topic", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Student_authUserId_key" ON "public"."Student"("authUserId");
