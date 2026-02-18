-- Clear old payment data (fund account IDs starting with 'fa_') from all profiles
-- This allows creators to re-submit bank details and get a fresh Route linked account (acc_...)
-- Run this in Supabase Dashboard → SQL Editor

UPDATE profiles
SET 
    razorpay_account_id = NULL,
    payment_details_verified = false,
    payment_details_added_at = NULL
WHERE razorpay_account_id LIKE 'fa_%'
   OR razorpay_account_id LIKE 'acc_%';

-- Verify the result
SELECT id, full_name, razorpay_account_id, payment_details_verified 
FROM profiles 
WHERE razorpay_account_id IS NOT NULL OR payment_details_verified = true;
