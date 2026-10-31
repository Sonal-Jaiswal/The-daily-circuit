-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "generationMeta" JSONB;

-- AlterTable
ALTER TABLE "ArticleSource" ADD COLUMN     "citationId" TEXT,
ADD COLUMN     "verificationText" TEXT;
