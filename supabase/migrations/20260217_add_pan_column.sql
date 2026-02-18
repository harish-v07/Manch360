-- Add PAN card number to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS pan_card_number TEXT;
