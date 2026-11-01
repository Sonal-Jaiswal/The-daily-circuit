-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "aiCoverageFocus" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "marketsCoverageFocus" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "writerGuidance" TEXT NOT NULL DEFAULT '';
