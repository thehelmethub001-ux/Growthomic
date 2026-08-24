-- Migration: add cart_state and search_cursor to conversations table

ALTER TABLE "public"."conversations"
ADD COLUMN IF NOT EXISTS "cart_state" JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS "search_cursor" INTEGER DEFAULT 0;
