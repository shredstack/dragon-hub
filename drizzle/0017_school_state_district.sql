-- Add state and district fields to schools for regional PTA resource configuration
ALTER TABLE "schools" ADD COLUMN "state" text;
ALTER TABLE "schools" ADD COLUMN "district" text;
