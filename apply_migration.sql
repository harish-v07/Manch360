-- Apply migration manually
-- Run this in Supabase SQL Editor

-- Add payment tracking fields to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS razorpay_signature TEXT;

-- Add product reference for better tracking
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id);

-- Add RLS policy for creators to view orders of their products
DO $$ BEGIN
    CREATE POLICY "Creators can view orders of their products"
      ON public.orders FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.products p
          WHERE p.id = orders.product_id AND p.creator_id = auth.uid()
        )
      );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add RLS policy for creators to view orders of their courses
DO $$ BEGIN
    CREATE POLICY "Creators can view orders of their courses"
      ON public.orders FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.courses c
          WHERE c.id = orders.item_id AND c.creator_id = auth.uid()
        )
      );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
