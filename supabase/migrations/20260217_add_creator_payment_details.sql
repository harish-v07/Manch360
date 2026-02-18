-- Add payment account fields to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS razorpay_account_id TEXT,
ADD COLUMN IF NOT EXISTS bank_account_number TEXT,
ADD COLUMN IF NOT EXISTS bank_ifsc_code TEXT,
ADD COLUMN IF NOT EXISTS bank_account_name TEXT,
ADD COLUMN IF NOT EXISTS payment_details_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS payment_details_added_at TIMESTAMPTZ;

-- Create payment_transfers table to track all transfers
CREATE TABLE IF NOT EXISTS public.payment_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  creator_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  learner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_id UUID NOT NULL,
  item_type TEXT NOT NULL, -- 'course' or 'product'
  total_amount DECIMAL(10, 2) NOT NULL,
  creator_amount DECIMAL(10, 2) NOT NULL,
  platform_fee DECIMAL(10, 2) DEFAULT 0,
  razorpay_transfer_id TEXT,
  razorpay_payment_id TEXT,
  status TEXT DEFAULT 'pending', -- pending, completed, failed
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_payment_transfers_creator 
ON public.payment_transfers(creator_id);

CREATE INDEX IF NOT EXISTS idx_payment_transfers_order 
ON public.payment_transfers(order_id);

CREATE INDEX IF NOT EXISTS idx_payment_transfers_status 
ON public.payment_transfers(status);

-- Enable RLS on payment_transfers
ALTER TABLE public.payment_transfers ENABLE ROW LEVEL SECURITY;

-- RLS Policies for payment_transfers
DO $$ BEGIN
    CREATE POLICY "Creators can view own transfers"
      ON public.payment_transfers FOR SELECT
      USING (auth.uid() = creator_id);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE POLICY "Learners can view own transfers"
      ON public.payment_transfers FOR SELECT
      USING (auth.uid() = learner_id);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE POLICY "System can insert transfers"
      ON public.payment_transfers FOR INSERT
      WITH CHECK (true);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE POLICY "System can update transfers"
      ON public.payment_transfers FOR UPDATE
      USING (true);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Function to calculate creator earnings
CREATE OR REPLACE FUNCTION public.get_creator_earnings(creator_uuid UUID)
RETURNS TABLE (
  total_earnings DECIMAL,
  pending_amount DECIMAL,
  completed_amount DECIMAL,
  total_transfers BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(creator_amount), 0) as total_earnings,
    COALESCE(SUM(CASE WHEN status = 'pending' THEN creator_amount ELSE 0 END), 0) as pending_amount,
    COALESCE(SUM(CASE WHEN status = 'completed' THEN creator_amount ELSE 0 END), 0) as completed_amount,
    COUNT(*) as total_transfers
  FROM public.payment_transfers
  WHERE creator_id = creator_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT SELECT ON public.payment_transfers TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_creator_earnings(UUID) TO authenticated;
