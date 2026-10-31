-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "Section" AS ENUM ('AI', 'TECHNOLOGY', 'MARKETS', 'IPO');

-- CreateEnum
CREATE TYPE "Desk" AS ENUM ('AI', 'MARKETS');

-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('DRAFT', 'NEEDS_REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED', 'FAILED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ArticleKind" AS ENUM ('NEWS', 'ANALYSIS', 'STOCK_MOVER', 'EXPLAINER');

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('NEW', 'DUPLICATE', 'CLASSIFIED', 'IRRELEVANT', 'STALE', 'SELECTED', 'NOT_SELECTED', 'USED');

-- CreateEnum
CREATE TYPE "PublishedAtSource" AS ENUM ('FEED_PUBLISHED', 'FEED_UPDATED', 'PAGE_METADATA', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('RSS', 'ATOM');

-- CreateEnum
CREATE TYPE "SourceKind" AS ENUM ('OFFICIAL', 'COMPANY', 'REGULATOR', 'EXCHANGE', 'PUBLISHER', 'WIRE');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('COLLECT', 'PROCESS', 'RANK', 'GENERATE', 'VALIDATE', 'PREPARE_EDITION', 'PUBLISH', 'POST_PUBLISH', 'MARKET_SNAPSHOT');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JobTrigger" AS ENUM ('SCHEDULE', 'MANUAL', 'RETRY');

-- CreateEnum
CREATE TYPE "EditionStatus" AS ENUM ('PREPARING', 'READY', 'PUBLISHED', 'PARTIAL', 'EMPTY', 'FAILED');

-- CreateEnum
CREATE TYPE "SubscriberStatus" AS ENUM ('PENDING', 'CONFIRMED', 'UNSUBSCRIBED');

-- CreateEnum
CREATE TYPE "InstrumentType" AS ENUM ('INDEX', 'EQUITY');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'SYSTEM');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EDITOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Author" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "bio" TEXT NOT NULL,
    "isAutomated" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Author_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "section" "Section" NOT NULL,
    "desk" "Desk" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleTag" (
    "articleId" UUID NOT NULL,
    "tagId" UUID NOT NULL,

    CONSTRAINT "ArticleTag_pkey" PRIMARY KEY ("articleId","tagId")
);

-- CreateTable
CREATE TABLE "NewsSource" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SourceType" NOT NULL DEFAULT 'RSS',
    "kind" "SourceKind" NOT NULL,
    "desk" "Desk" NOT NULL,
    "feedUrl" TEXT NOT NULL,
    "homepageUrl" TEXT NOT NULL,
    "reliability" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "termsNote" TEXT,
    "requiresLicenseReview" BOOLEAN NOT NULL DEFAULT false,
    "maxItemsPerFetch" INTEGER NOT NULL DEFAULT 50,
    "etag" TEXT,
    "lastModified" TEXT,
    "lastFetchedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastError" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryCluster" (
    "id" UUID NOT NULL,
    "desk" "Desk" NOT NULL,
    "editionDate" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "signature" TEXT,
    "sourceCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryCluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsCandidate" (
    "id" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "guid" TEXT,
    "originalHeadline" TEXT NOT NULL,
    "normalizedHeadline" TEXT NOT NULL,
    "feedSummary" TEXT,
    "publishedAt" TIMESTAMP(3),
    "publishedAtSource" "PublishedAtSource" NOT NULL DEFAULT 'UNKNOWN',
    "feedUpdatedAt" TIMESTAMP(3),
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "desk" "Desk" NOT NULL,
    "section" "Section",
    "editionDate" DATE NOT NULL,
    "status" "CandidateStatus" NOT NULL DEFAULT 'NEW',
    "duplicateOfId" UUID,
    "clusterId" UUID,
    "isClusterPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isOriginalReporting" BOOLEAN,
    "extractedFacts" JSONB,
    "classification" JSONB,
    "sourceReliability" DOUBLE PRECISION NOT NULL,
    "importanceScore" DOUBLE PRECISION,
    "credibilityScore" DOUBLE PRECISION,
    "freshnessScore" DOUBLE PRECISION,
    "impactScore" DOUBLE PRECISION,
    "interestScore" DOUBLE PRECISION,
    "totalScore" DOUBLE PRECISION,
    "rankPosition" INTEGER,
    "rankingExplanation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "ArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "kind" "ArticleKind" NOT NULL DEFAULT 'NEWS',
    "section" "Section" NOT NULL,
    "categoryId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "editionId" UUID,
    "clusterId" UUID,
    "idempotencyKey" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "introduction" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "whyItMatters" TEXT NOT NULL,
    "keyFacts" JSONB NOT NULL,
    "implications" TEXT NOT NULL,
    "risks" TEXT NOT NULL,
    "seoTitle" TEXT NOT NULL,
    "seoDescription" TEXT NOT NULL,
    "imageAlt" TEXT NOT NULL,
    "imageUrl" TEXT,
    "imageCredit" TEXT,
    "imageLicense" TEXT,
    "readingTimeMinutes" INTEGER NOT NULL,
    "disclaimerRequired" BOOLEAN NOT NULL DEFAULT false,
    "requiresHumanReview" BOOLEAN NOT NULL DEFAULT false,
    "reviewFlags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "validationReport" JSONB,
    "generatedByModel" TEXT,
    "promptVersion" TEXT,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "contentModifiedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleSource" (
    "id" UUID NOT NULL,
    "articleId" UUID NOT NULL,
    "candidateId" UUID,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publisherName" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "accessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ArticleSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleDailyStat" (
    "articleId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ArticleDailyStat_pkey" PRIMARY KEY ("articleId","date")
);

-- CreateTable
CREATE TABLE "DailyEdition" (
    "id" UUID NOT NULL,
    "editionDate" DATE NOT NULL,
    "status" "EditionStatus" NOT NULL DEFAULT 'PREPARING',
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "aiCount" INTEGER NOT NULL DEFAULT 0,
    "marketCount" INTEGER NOT NULL DEFAULT 0,
    "stats" JSONB,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "reportSentAt" TIMESTAMP(3),
    "digestSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyEdition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockSnapshot" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "instrumentType" "InstrumentType" NOT NULL DEFAULT 'EQUITY',
    "sector" TEXT,
    "lastPrice" DECIMAL(14,4) NOT NULL,
    "previousClose" DECIMAL(14,4) NOT NULL,
    "changePercent" DECIMAL(9,4) NOT NULL,
    "volume" BIGINT,
    "dataTimestamp" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editionDate" DATE NOT NULL,
    "movementReason" TEXT,
    "reasonVerified" BOOLEAN NOT NULL DEFAULT false,
    "articleId" UUID,

    CONSTRAINT "StockSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobExecution" (
    "id" UUID NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "trigger" "JobTrigger" NOT NULL DEFAULT 'SCHEDULE',
    "editionDate" DATE,
    "idempotencyKey" TEXT,
    "payload" JSONB,
    "result" JSONB,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedBy" TEXT,
    "lockedAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "requestedById" UUID,
    "parentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobLog" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiUsage" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'anthropic',
    "model" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(12,6) NOT NULL,
    "stopReason" TEXT,
    "requestId" TEXT,
    "jobId" UUID,
    "articleId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsletterSubscriber" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "status" "SubscriberStatus" NOT NULL DEFAULT 'PENDING',
    "confirmTokenHash" TEXT,
    "confirmTokenExpires" TIMESTAMP(3),
    "unsubscribeTokenHash" TEXT NOT NULL,
    "consentText" TEXT NOT NULL,
    "source" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsletterSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactMessage" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "handled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "siteName" TEXT NOT NULL DEFAULT 'The Daily Circuit',
    "tagline" TEXT NOT NULL DEFAULT 'AI and Indian markets, every evening at 9.',
    "publishTimeIst" TEXT NOT NULL DEFAULT '21:00',
    "maxAiArticles" INTEGER NOT NULL DEFAULT 10,
    "maxMarketArticles" INTEGER NOT NULL DEFAULT 10,
    "minSelectionScore" DOUBLE PRECISION NOT NULL DEFAULT 0.55,
    "scoringWeights" JSONB NOT NULL,
    "autoPublish" BOOLEAN NOT NULL DEFAULT true,
    "latePublishGraceMin" INTEGER NOT NULL DEFAULT 180,
    "monthlyBudgetUsd" DOUBLE PRECISION NOT NULL DEFAULT 150,
    "enableFactCheckPass" BOOLEAN NOT NULL DEFAULT true,
    "marketWatchlist" JSONB NOT NULL,
    "significantMovePct" DOUBLE PRECISION NOT NULL DEFAULT 4,
    "adsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "adsensePublisherId" TEXT,
    "adSlots" JSONB,
    "newsletterDigestEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key","windowStart")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Author_slug_key" ON "Author"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Category_section_key" ON "Category"("section");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_slug_key" ON "Tag"("slug");

-- CreateIndex
CREATE INDEX "ArticleTag_tagId_idx" ON "ArticleTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "NewsSource_slug_key" ON "NewsSource"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "NewsSource_feedUrl_key" ON "NewsSource"("feedUrl");

-- CreateIndex
CREATE INDEX "NewsSource_desk_isEnabled_idx" ON "NewsSource"("desk", "isEnabled");

-- CreateIndex
CREATE INDEX "StoryCluster_editionDate_desk_idx" ON "StoryCluster"("editionDate", "desk");

-- CreateIndex
CREATE UNIQUE INDEX "NewsCandidate_canonicalUrl_key" ON "NewsCandidate"("canonicalUrl");

-- CreateIndex
CREATE INDEX "NewsCandidate_editionDate_desk_status_idx" ON "NewsCandidate"("editionDate", "desk", "status");

-- CreateIndex
CREATE INDEX "NewsCandidate_clusterId_idx" ON "NewsCandidate"("clusterId");

-- CreateIndex
CREATE INDEX "NewsCandidate_sourceId_publishedAt_idx" ON "NewsCandidate"("sourceId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Article_slug_key" ON "Article"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Article_clusterId_key" ON "Article"("clusterId");

-- CreateIndex
CREATE UNIQUE INDEX "Article_idempotencyKey_key" ON "Article"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Article_status_publishedAt_idx" ON "Article"("status", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Article_section_status_publishedAt_idx" ON "Article"("section", "status", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Article_editionId_idx" ON "Article"("editionId");

-- CreateIndex
CREATE INDEX "ArticleSource_candidateId_idx" ON "ArticleSource"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleSource_articleId_url_key" ON "ArticleSource"("articleId", "url");

-- CreateIndex
CREATE INDEX "ArticleDailyStat_date_idx" ON "ArticleDailyStat"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyEdition_editionDate_key" ON "DailyEdition"("editionDate");

-- CreateIndex
CREATE INDEX "StockSnapshot_editionDate_instrumentType_idx" ON "StockSnapshot"("editionDate", "instrumentType");

-- CreateIndex
CREATE INDEX "StockSnapshot_symbol_dataTimestamp_idx" ON "StockSnapshot"("symbol", "dataTimestamp" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "StockSnapshot_provider_exchange_symbol_dataTimestamp_key" ON "StockSnapshot"("provider", "exchange", "symbol", "dataTimestamp");

-- CreateIndex
CREATE UNIQUE INDEX "JobExecution_idempotencyKey_key" ON "JobExecution"("idempotencyKey");

-- CreateIndex
CREATE INDEX "JobExecution_status_runAfter_idx" ON "JobExecution"("status", "runAfter");

-- CreateIndex
CREATE INDEX "JobExecution_type_editionDate_idx" ON "JobExecution"("type", "editionDate");

-- CreateIndex
CREATE INDEX "JobExecution_createdAt_idx" ON "JobExecution"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "JobLog_jobId_createdAt_idx" ON "JobLog"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "ApiUsage_createdAt_idx" ON "ApiUsage"("createdAt");

-- CreateIndex
CREATE INDEX "ApiUsage_purpose_createdAt_idx" ON "ApiUsage"("purpose", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSubscriber_email_key" ON "NewsletterSubscriber"("email");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSubscriber_confirmTokenHash_key" ON "NewsletterSubscriber"("confirmTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSubscriber_unsubscribeTokenHash_key" ON "NewsletterSubscriber"("unsubscribeTokenHash");

-- CreateIndex
CREATE INDEX "NewsletterSubscriber_status_idx" ON "NewsletterSubscriber"("status");

-- CreateIndex
CREATE INDEX "ContactMessage_handled_createdAt_idx" ON "ContactMessage"("handled", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "RateLimitBucket_windowStart_idx" ON "RateLimitBucket"("windowStart");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleTag" ADD CONSTRAINT "ArticleTag_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleTag" ADD CONSTRAINT "ArticleTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsCandidate" ADD CONSTRAINT "NewsCandidate_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "NewsSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsCandidate" ADD CONSTRAINT "NewsCandidate_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "StoryCluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Author"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "DailyEdition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "StoryCluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleSource" ADD CONSTRAINT "ArticleSource_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleSource" ADD CONSTRAINT "ArticleSource_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "NewsCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleDailyStat" ADD CONSTRAINT "ArticleDailyStat_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockSnapshot" ADD CONSTRAINT "StockSnapshot_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobExecution" ADD CONSTRAINT "JobExecution_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobLog" ADD CONSTRAINT "JobLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "JobExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiUsage" ADD CONSTRAINT "ApiUsage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "JobExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiUsage" ADD CONSTRAINT "ApiUsage_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteSettings" ADD CONSTRAINT "SiteSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
