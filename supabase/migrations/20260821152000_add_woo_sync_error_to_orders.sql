-- Migration to add woo_sync_error column to the orders table

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS woo_sync_error text;
