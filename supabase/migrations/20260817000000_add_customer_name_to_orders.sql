-- Add customer_name column to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name text;
