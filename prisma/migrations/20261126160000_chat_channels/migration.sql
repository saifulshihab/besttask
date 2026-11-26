-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Channel_projectId_name_key" ON "Channel"("projectId", "name");

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing project gets its default #general channel, which
-- new projects receive when they are created.
INSERT INTO "Channel" ("id", "projectId", "name", "isDefault", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "id", 'general', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Project";
