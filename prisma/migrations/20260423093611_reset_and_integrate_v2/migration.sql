-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "MemoryCategory" AS ENUM ('EMOTION', 'WORK_CAREER', 'SOCIAL_LIFE', 'ROUTINE', 'IDENTITY', 'PREFERENCES', 'GOALS', 'LIFE_STORY', 'UPCOMING', 'HEALTH', 'HOBBIES', 'PEOPLE', 'LIVING_SITUATION', 'FINANCE', 'TURNING_POINT', 'VALUE', 'OTHER');

-- CreateEnum
CREATE TYPE "Confidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "RecallPriority" AS ENUM ('ALWAYS', 'CONTEXTUAL', 'PROACTIVE', 'BACKGROUND');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('MONITOR', 'WARNING', 'URGENT');

-- CreateEnum
CREATE TYPE "EmotionalArc" AS ENUM ('IMPROVING', 'DECLINING', 'STABLE', 'VOLATILE');

-- CreateEnum
CREATE TYPE "FragmentStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PRIVATE', 'PRIVATE_TO_PERSON', 'FAMILY', 'CLOSE_FRIENDS', 'PUBLIC');

-- CreateEnum
CREATE TYPE "VoiceStyle" AS ENUM ('CONVERSATIONAL', 'NARRATIVE', 'LETTER');

-- CreateEnum
CREATE TYPE "BookStatus" AS ENUM ('DRAFT', 'PENDING', 'GENERATING', 'REVIEW', 'COMPLETED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "BookFormat" AS ENUM ('WEB', 'PDF', 'PRINT');

-- CreateEnum
CREATE TYPE "PipelineVersion" AS ENUM ('A', 'B');

-- CreateEnum
CREATE TYPE "VerificationVerdict" AS ENUM ('PASS', 'REVISE', 'REJECT');

-- CreateEnum
CREATE TYPE "IntendedAudience" AS ENUM ('MYSELF', 'SPOUSE', 'CHILDREN', 'DAUGHTER', 'SON', 'FUTURE_GRANDCHILDREN', 'FRIENDS', 'PUBLIC_READERS');

-- CreateEnum
CREATE TYPE "StoryRelationshipType" AS ENUM ('FOLLOWS', 'CONTRASTS', 'EXPANDS', 'ECHOES', 'CAUSED_BY');

-- CreateEnum
CREATE TYPE "ConversationMode" AS ENUM ('AUTO', 'COMPANION', 'STORY');

-- CreateTable
CREATE TABLE IF NOT EXISTS "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT 'user',
    "lang" TEXT NOT NULL DEFAULT 'en',
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "UserLimit" (
    "userId" INTEGER NOT NULL,
    "dailyMinutes" INTEGER NOT NULL DEFAULT 30,
    "monthlyMinutes" INTEGER NOT NULL DEFAULT 300,
    "memoryKb" INTEGER NOT NULL DEFAULT 512,

    CONSTRAINT "UserLimit_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "UserMemory" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "characterId" TEXT NOT NULL DEFAULT 'emma',
    "factsJson" TEXT NOT NULL DEFAULT '[]',
    "summary" TEXT NOT NULL DEFAULT '',
    "transcriptJson" TEXT NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "UsageLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "sessionDate" TEXT NOT NULL,
    "minutesUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "turnsCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "UsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" INTEGER NOT NULL,
    "character_id" VARCHAR(20) NOT NULL DEFAULT 'emma',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),
    "total_turns" INTEGER NOT NULL DEFAULT 0,
    "memories_extracted" BOOLEAN NOT NULL DEFAULT false,
    "extraction_count" INTEGER NOT NULL DEFAULT 0,
    "transcript_data" JSONB NOT NULL DEFAULT '[]',
    "fragment_candidate" BOOLEAN NOT NULL DEFAULT false,
    "fragment_elements" JSONB NOT NULL DEFAULT '{}',
    "conversation_mode" "ConversationMode" NOT NULL DEFAULT 'AUTO',
    "one_word_summary" VARCHAR(50),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_nodes" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" INTEGER NOT NULL,
    "node_type" VARCHAR(20) NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "primary_category" "MemoryCategory" NOT NULL,
    "secondary_categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "emotional_weight" INTEGER NOT NULL DEFAULT 1,
    "mention_count" INTEGER NOT NULL DEFAULT 1,
    "confidence" "Confidence" NOT NULL DEFAULT 'MEDIUM',
    "recall_priority" "RecallPriority" NOT NULL DEFAULT 'CONTEXTUAL',
    "first_mentioned" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_mentioned" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "story_fragment_id" UUID,
    "narrative_relevance" INTEGER NOT NULL DEFAULT 0,
    "times_discussed" INTEGER NOT NULL DEFAULT 0,
    "discussion_depth" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "memory_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_edges" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" INTEGER NOT NULL,
    "source_node" UUID NOT NULL,
    "target_node" UUID NOT NULL,
    "relationship" VARCHAR(30) NOT NULL,
    "weight" DECIMAL(4,2) NOT NULL DEFAULT 0.50,
    "co_occurrence" INTEGER NOT NULL DEFAULT 1,
    "bidirectional" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_reinforced" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memory_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_embeddings" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" INTEGER NOT NULL,
    "memory_id" UUID NOT NULL,
    "content_text" TEXT NOT NULL,
    "embedding" vector(768) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memory_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_archive" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "original_id" UUID NOT NULL,
    "user_id" INTEGER NOT NULL,
    "node_type" VARCHAR(20),
    "label" VARCHAR(100),
    "data" JSONB,
    "reason" VARCHAR(50) DEFAULT 'updated',
    "archived_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memory_archive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emma_reflections" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" INTEGER NOT NULL,
    "reflection" TEXT NOT NULL,
    "confidence" "Confidence" NOT NULL DEFAULT 'MEDIUM',
    "trigger_type" VARCHAR(30) NOT NULL,
    "session_id" UUID,
    "visible_to_user" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emma_reflections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emotion_turns" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" INTEGER NOT NULL,
    "session_id" UUID NOT NULL,
    "turn_number" INTEGER NOT NULL,
    "user_message_preview" TEXT,
    "valence" DECIMAL(4,3),
    "arousal" DECIMAL(4,3),
    "emotions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dominant_emotion" VARCHAR(30),
    "trigger_topic" VARCHAR(100),
    "concern_level" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emotion_turns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emotion_sessions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" INTEGER NOT NULL,
    "session_id" UUID NOT NULL,
    "session_date" DATE NOT NULL DEFAULT CURRENT_DATE,
    "avg_valence" DECIMAL(4,3),
    "min_valence" DECIMAL(4,3),
    "max_valence" DECIMAL(4,3),
    "avg_arousal" DECIMAL(4,3),
    "emotion_counts" JSONB NOT NULL DEFAULT '{}',
    "dominant_emotion" VARCHAR(30),
    "emotional_arc" "EmotionalArc",
    "key_triggers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "positive_moments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "concern_events" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "total_turns" INTEGER NOT NULL DEFAULT 0,
    "session_duration_min" INTEGER,
    "max_concern_level" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emotion_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emotion_alerts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" INTEGER NOT NULL,
    "alert_type" VARCHAR(30) NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "family_notified" BOOLEAN NOT NULL DEFAULT false,
    "notified_at" TIMESTAMPTZ(6),
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emotion_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_fragments" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "subtitle" VARCHAR(300),
    "content" TEXT NOT NULL,
    "content_raw" TEXT,
    "source_session_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "source_memory_node_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "source_conversation_date" DATE,
    "tags_era" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags_people" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags_place" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags_theme" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags_emotion" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "word_count" INTEGER NOT NULL DEFAULT 0,
    "language" VARCHAR(5) NOT NULL DEFAULT 'ko',
    "voice_style" "VoiceStyle" NOT NULL DEFAULT 'CONVERSATIONAL',
    "status" "FragmentStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "Visibility" NOT NULL DEFAULT 'PRIVATE',
    "intended_audience" "IntendedAudience"[] DEFAULT ARRAY[]::"IntendedAudience"[],
    "media_attachments" JSONB NOT NULL DEFAULT '[]',
    "story_id" UUID,
    "story_order" INTEGER,
    "user_edited" BOOLEAN NOT NULL DEFAULT false,
    "user_edited_at" TIMESTAMPTZ(6),
    "edit_count" INTEGER NOT NULL DEFAULT 0,
    "generated_by" VARCHAR(50),
    "generation_prompt_hash" VARCHAR(64),
    "generation_version" INTEGER NOT NULL DEFAULT 1,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "pipeline_version" "PipelineVersion" NOT NULL DEFAULT 'A',
    "raw_extract" JSONB,
    "structured_draft" JSONB,
    "source_utterances" JSONB,
    "verification_score" DECIMAL(4,3),
    "verification_verdict" "VerificationVerdict",
    "interpretive_leaps" JSONB,
    "attribution_blocks" JSONB,
    "signature_phrases_used" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "generation_cost_usd" DECIMAL(10,6),
    "generation_duration_ms" INTEGER,
    "generation_retries" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "story_fragments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stories" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "cover_image_url" TEXT,
    "chapter_type" VARCHAR(20) NOT NULL DEFAULT 'thematic',
    "narrative_transitions" JSONB NOT NULL DEFAULT '[]',
    "tags_theme" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags_era" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "fragment_count" INTEGER NOT NULL DEFAULT 0,
    "total_word_count" INTEGER NOT NULL DEFAULT 0,
    "book_id" UUID,
    "book_order" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_relationships" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" INTEGER NOT NULL,
    "from_story_id" UUID NOT NULL,
    "to_story_id" UUID NOT NULL,
    "relationship" "StoryRelationshipType" NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_collections" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" INTEGER NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "book_chapter_title" VARCHAR(300),
    "name_generated_by" VARCHAR(10) NOT NULL DEFAULT 'ai',
    "description" TEXT,
    "cover_color" VARCHAR(20),
    "cover_emoji" VARCHAR(10),
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_book_ready" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_fragments" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "collection_id" UUID NOT NULL,
    "fragment_id" UUID NOT NULL,
    "user_order" INTEGER NOT NULL,
    "user_note" TEXT,
    "added_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_fragments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "books" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" INTEGER NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "author_name" VARCHAR(100),
    "dedication" TEXT,
    "preface" TEXT,
    "epilogue" TEXT,
    "format" "BookFormat" NOT NULL DEFAULT 'WEB',
    "output_url" TEXT,
    "status" "BookStatus" NOT NULL DEFAULT 'DRAFT',
    "story_count" INTEGER NOT NULL DEFAULT 0,
    "total_word_count" INTEGER NOT NULL DEFAULT 0,
    "cover_image_url" TEXT,
    "design_template" VARCHAR(50) NOT NULL DEFAULT 'classic',
    "output_data" TEXT,
    "fragment_ids" JSONB NOT NULL DEFAULT '[]',
    "auto_preface" BOOLEAN NOT NULL DEFAULT true,
    "auto_epilogue" BOOLEAN NOT NULL DEFAULT true,
    "pipeline_version" "PipelineVersion",
    "experiment_label" VARCHAR(100),
    "price_usd" DECIMAL(10,2),
    "stripe_product_id" VARCHAR(100),
    "purchase_count" INTEGER NOT NULL DEFAULT 0,
    "is_for_sale" BOOLEAN NOT NULL DEFAULT false,
    "source_type" VARCHAR(20) NOT NULL DEFAULT 'auto_story',
    "source_collection_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_voice_profiles" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" INTEGER NOT NULL,
    "avg_sentence_length" DECIMAL(5,2),
    "frequent_expressions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "emotion_style" VARCHAR(20) NOT NULL DEFAULT 'direct',
    "humor_frequency" VARCHAR(20) NOT NULL DEFAULT 'medium',
    "language_mix" JSONB NOT NULL DEFAULT '{}',
    "preferred_voice" VARCHAR(30) NOT NULL DEFAULT 'conversational',
    "sessions_analyzed" INTEGER NOT NULL DEFAULT 0,
    "last_analyzed_at" TIMESTAMPTZ(6),
    "voice_prompt_summary" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_voice_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fragment_generation_queue" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" INTEGER NOT NULL,
    "job_type" VARCHAR(30) NOT NULL,
    "input_data" JSONB NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "priority" INTEGER NOT NULL DEFAULT 5,
    "output_data" JSONB,
    "error_message" TEXT,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "processing_time_ms" INTEGER,
    "model_used" VARCHAR(50),
    "pipeline_version" "PipelineVersion",
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fragment_generation_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiment_runs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" INTEGER NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "pipeline_version" "PipelineVersion" NOT NULL,
    "fragment_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "experiment_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_log" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "message_type" VARCHAR(20) NOT NULL,
    "message_text" TEXT NOT NULL,
    "channel" VARCHAR(10) NOT NULL DEFAULT 'sms',
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "user_replied" BOOLEAN NOT NULL DEFAULT false,
    "replied_at" TIMESTAMPTZ(6),
    "sent_date" DATE NOT NULL DEFAULT CURRENT_DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outreach_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "endpoint" TEXT NOT NULL,
    "keys_p256dh" TEXT NOT NULL,
    "keys_auth" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_inbound" (
    "id" SERIAL NOT NULL,
    "from_phone" VARCHAR(20) NOT NULL,
    "user_id" INTEGER,
    "body" TEXT NOT NULL,
    "twilio_sid" VARCHAR(50),
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_inbound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_feedback" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" INTEGER NOT NULL,
    "session_id" UUID,
    "rating" SMALLINT NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "UserMemory_userId_characterId_key" ON "UserMemory"("userId", "characterId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "UsageLog_userId_sessionDate_key" ON "UsageLog"("userId", "sessionDate");

-- CreateIndex
CREATE INDEX "chat_sessions_user_id_idx" ON "chat_sessions"("user_id");

-- CreateIndex
CREATE INDEX "chat_sessions_user_id_started_at_idx" ON "chat_sessions"("user_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "memory_nodes_user_id_idx" ON "memory_nodes"("user_id");

-- CreateIndex
CREATE INDEX "memory_nodes_user_id_is_active_idx" ON "memory_nodes"("user_id", "is_active");

-- CreateIndex
CREATE INDEX "memory_nodes_user_id_node_type_idx" ON "memory_nodes"("user_id", "node_type");

-- CreateIndex
CREATE INDEX "memory_nodes_user_id_recall_priority_idx" ON "memory_nodes"("user_id", "recall_priority");

-- CreateIndex
CREATE INDEX "memory_nodes_user_id_emotional_weight_idx" ON "memory_nodes"("user_id", "emotional_weight" DESC);

-- CreateIndex
CREATE INDEX "idx_memory_nodes_narrative" ON "memory_nodes"("user_id", "narrative_relevance" DESC);

-- CreateIndex
CREATE INDEX "idx_memory_nodes_fragment" ON "memory_nodes"("story_fragment_id");

-- CreateIndex
CREATE INDEX "memory_edges_source_node_idx" ON "memory_edges"("source_node");

-- CreateIndex
CREATE INDEX "memory_edges_target_node_idx" ON "memory_edges"("target_node");

-- CreateIndex
CREATE INDEX "memory_edges_user_id_idx" ON "memory_edges"("user_id");

-- CreateIndex
CREATE INDEX "memory_edges_user_id_weight_idx" ON "memory_edges"("user_id", "weight" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "memory_edges_source_node_target_node_relationship_key" ON "memory_edges"("source_node", "target_node", "relationship");

-- CreateIndex
CREATE INDEX "memory_embeddings_memory_id_idx" ON "memory_embeddings"("memory_id");

-- CreateIndex
CREATE INDEX "memory_embeddings_user_id_idx" ON "memory_embeddings"("user_id");

-- CreateIndex
CREATE INDEX "idx_memory_archive_user_time" ON "memory_archive"("user_id", "archived_at" DESC);

-- CreateIndex
CREATE INDEX "emma_reflections_user_id_created_at_idx" ON "emma_reflections"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "emma_reflections_user_id_visible_to_user_idx" ON "emma_reflections"("user_id", "visible_to_user");

-- CreateIndex
CREATE INDEX "emotion_turns_session_id_idx" ON "emotion_turns"("session_id");

-- CreateIndex
CREATE INDEX "emotion_turns_user_id_created_at_idx" ON "emotion_turns"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "emotion_turns_session_id_turn_number_key" ON "emotion_turns"("session_id", "turn_number");

-- CreateIndex
CREATE UNIQUE INDEX "emotion_sessions_session_id_key" ON "emotion_sessions"("session_id");

-- CreateIndex
CREATE INDEX "emotion_sessions_user_id_session_date_idx" ON "emotion_sessions"("user_id", "session_date" DESC);

-- CreateIndex
CREATE INDEX "emotion_sessions_user_id_max_concern_level_idx" ON "emotion_sessions"("user_id", "max_concern_level" DESC);

-- CreateIndex
CREATE INDEX "emotion_alerts_user_id_created_at_idx" ON "emotion_alerts"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "story_fragments_user_id_idx" ON "story_fragments"("user_id");

-- CreateIndex
CREATE INDEX "idx_fragments_date" ON "story_fragments"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_fragments_status" ON "story_fragments"("user_id", "status");

-- CreateIndex
CREATE INDEX "idx_fragments_story" ON "story_fragments"("story_id", "story_order");

-- CreateIndex
CREATE INDEX "idx_fragments_tags_era" ON "story_fragments" USING GIN ("tags_era");

-- CreateIndex
CREATE INDEX "idx_fragments_tags_people" ON "story_fragments" USING GIN ("tags_people");

-- CreateIndex
CREATE INDEX "idx_fragments_tags_place" ON "story_fragments" USING GIN ("tags_place");

-- CreateIndex
CREATE INDEX "idx_fragments_tags_theme" ON "story_fragments" USING GIN ("tags_theme");

-- CreateIndex
CREATE INDEX "idx_fragments_truncated" ON "story_fragments"("user_id", "truncated");

-- CreateIndex
CREATE INDEX "idx_fragments_pipeline" ON "story_fragments"("user_id", "pipeline_version");

-- CreateIndex
CREATE INDEX "stories_user_id_idx" ON "stories"("user_id");

-- CreateIndex
CREATE INDEX "story_relationships_user_id_idx" ON "story_relationships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "story_relationships_from_story_id_to_story_id_relationship_key" ON "story_relationships"("from_story_id", "to_story_id", "relationship");

-- CreateIndex
CREATE INDEX "user_collections_user_id_display_order_idx" ON "user_collections"("user_id", "display_order");

-- CreateIndex
CREATE INDEX "collection_fragments_collection_id_user_order_idx" ON "collection_fragments"("collection_id", "user_order");

-- CreateIndex
CREATE INDEX "collection_fragments_fragment_id_idx" ON "collection_fragments"("fragment_id");

-- CreateIndex
CREATE UNIQUE INDEX "collection_fragments_collection_id_fragment_id_key" ON "collection_fragments"("collection_id", "fragment_id");

-- CreateIndex
CREATE INDEX "books_user_id_idx" ON "books"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_voice_profiles_user_id_key" ON "user_voice_profiles"("user_id");

-- CreateIndex
CREATE INDEX "fragment_generation_queue_status_priority_idx" ON "fragment_generation_queue"("status", "priority" DESC);

-- CreateIndex
CREATE INDEX "fragment_generation_queue_user_id_idx" ON "fragment_generation_queue"("user_id");

-- CreateIndex
CREATE INDEX "experiment_runs_user_id_created_at_idx" ON "experiment_runs"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "outreach_log_user_id_sent_date_idx" ON "outreach_log"("user_id", "sent_date");

-- CreateIndex
CREATE INDEX "outreach_log_sent_date_idx" ON "outreach_log"("sent_date");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_user_id_key" ON "push_subscriptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sms_inbound_twilio_sid_key" ON "sms_inbound"("twilio_sid");

-- CreateIndex
CREATE INDEX "sms_inbound_user_id_idx" ON "sms_inbound"("user_id");

-- CreateIndex
CREATE INDEX "session_feedback_user_id_idx" ON "session_feedback"("user_id");

-- CreateIndex
CREATE INDEX "session_feedback_created_at_idx" ON "session_feedback"("created_at");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserLimit_userId_fkey') THEN
    ALTER TABLE "UserLimit" ADD CONSTRAINT "UserLimit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserMemory_userId_fkey') THEN
    ALTER TABLE "UserMemory" ADD CONSTRAINT "UserMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UsageLog_userId_fkey') THEN
    ALTER TABLE "UsageLog" ADD CONSTRAINT "UsageLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_nodes" ADD CONSTRAINT "memory_nodes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_nodes" ADD CONSTRAINT "memory_nodes_story_fragment_id_fkey" FOREIGN KEY ("story_fragment_id") REFERENCES "story_fragments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_edges" ADD CONSTRAINT "memory_edges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_edges" ADD CONSTRAINT "memory_edges_source_node_fkey" FOREIGN KEY ("source_node") REFERENCES "memory_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_edges" ADD CONSTRAINT "memory_edges_target_node_fkey" FOREIGN KEY ("target_node") REFERENCES "memory_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_embeddings" ADD CONSTRAINT "memory_embeddings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_embeddings" ADD CONSTRAINT "memory_embeddings_memory_id_fkey" FOREIGN KEY ("memory_id") REFERENCES "memory_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_archive" ADD CONSTRAINT "memory_archive_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emma_reflections" ADD CONSTRAINT "emma_reflections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emotion_turns" ADD CONSTRAINT "emotion_turns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emotion_turns" ADD CONSTRAINT "emotion_turns_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emotion_sessions" ADD CONSTRAINT "emotion_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emotion_sessions" ADD CONSTRAINT "emotion_sessions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emotion_alerts" ADD CONSTRAINT "emotion_alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_fragments" ADD CONSTRAINT "story_fragments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_fragments" ADD CONSTRAINT "story_fragments_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_relationships" ADD CONSTRAINT "story_relationships_from_story_id_fkey" FOREIGN KEY ("from_story_id") REFERENCES "story_fragments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_relationships" ADD CONSTRAINT "story_relationships_to_story_id_fkey" FOREIGN KEY ("to_story_id") REFERENCES "story_fragments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_collections" ADD CONSTRAINT "user_collections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_fragments" ADD CONSTRAINT "collection_fragments_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "user_collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_fragments" ADD CONSTRAINT "collection_fragments_fragment_id_fkey" FOREIGN KEY ("fragment_id") REFERENCES "story_fragments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "books" ADD CONSTRAINT "books_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_voice_profiles" ADD CONSTRAINT "user_voice_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fragment_generation_queue" ADD CONSTRAINT "fragment_generation_queue_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_runs" ADD CONSTRAINT "experiment_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_log" ADD CONSTRAINT "outreach_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_inbound" ADD CONSTRAINT "sms_inbound_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_feedback" ADD CONSTRAINT "session_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_feedback" ADD CONSTRAINT "session_feedback_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ═══════════════════════════════════════════════════════════════
-- RAW SQL AUGMENTATION (from doc 10 §7)
-- ═══════════════════════════════════════════════════════════════

-- ─── CHECK constraints ───
-- memory_nodes
ALTER TABLE memory_nodes ADD CONSTRAINT chk_memory_nodes_emotional_weight
  CHECK (emotional_weight BETWEEN 1 AND 5);
ALTER TABLE memory_nodes ADD CONSTRAINT chk_memory_nodes_narrative_relevance
  CHECK (narrative_relevance BETWEEN 0 AND 5);

-- memory_edges
ALTER TABLE memory_edges ADD CONSTRAINT chk_memory_edges_weight
  CHECK (weight BETWEEN 0.00 AND 1.00);

-- emotion_turns
ALTER TABLE emotion_turns ADD CONSTRAINT chk_emotion_turns_valence
  CHECK (valence BETWEEN -1.000 AND 1.000);
ALTER TABLE emotion_turns ADD CONSTRAINT chk_emotion_turns_arousal
  CHECK (arousal BETWEEN 0.000 AND 1.000);
ALTER TABLE emotion_turns ADD CONSTRAINT chk_emotion_turns_concern
  CHECK (concern_level BETWEEN 0 AND 2);

-- session_feedback
ALTER TABLE session_feedback ADD CONSTRAINT chk_session_feedback_rating
  CHECK (rating BETWEEN 1 AND 5);

-- books
ALTER TABLE books ADD CONSTRAINT chk_books_source_type
  CHECK (source_type IN ('auto_story', 'user_collection'));

-- ─── Partial indexes ───
-- story_fragments
CREATE INDEX idx_fragments_status_active ON story_fragments(user_id, status)
  WHERE status <> 'DELETED';
CREATE INDEX idx_fragments_story_ordered ON story_fragments(story_id, story_order)
  WHERE story_id IS NOT NULL;
CREATE INDEX idx_fragments_truncated_only ON story_fragments(user_id, truncated)
  WHERE truncated = true;

-- memory_nodes
CREATE INDEX idx_memory_nodes_narrative_high ON memory_nodes(user_id, narrative_relevance DESC)
  WHERE narrative_relevance >= 3;
CREATE INDEX idx_memory_nodes_fragment_linked ON memory_nodes(story_fragment_id)
  WHERE story_fragment_id IS NOT NULL;

-- emotion_alerts
CREATE INDEX idx_alerts_unresolved ON emotion_alerts(user_id, resolved)
  WHERE resolved = false;

-- sms_inbound
CREATE INDEX idx_sms_inbound_unprocessed ON sms_inbound(processed)
  WHERE processed = false;

-- ─── pgvector IVFFlat cosine index ───
CREATE INDEX idx_embeddings_vector ON memory_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- user_collections (added from doc 11)
ALTER TABLE user_collections ADD CONSTRAINT chk_user_collections_name_gen
  CHECK (name_generated_by IN ('ai', 'user'));
