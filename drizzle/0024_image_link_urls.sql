-- Add link_url column to media_library table
ALTER TABLE "media_library" ADD COLUMN "link_url" text;

-- Add link_url column to email_content_images table
ALTER TABLE "email_content_images" ADD COLUMN "link_url" text;
