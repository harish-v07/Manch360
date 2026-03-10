-- Add file_url and usage_instructions to products table for digital products
ALTER TABLE public.products
ADD COLUMN file_url TEXT,
ADD COLUMN usage_instructions TEXT;
