-- Add session tracking fields to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS active_session_id TEXT,
ADD COLUMN IF NOT EXISTS session_created_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

-- Create index for faster session lookups
CREATE INDEX IF NOT EXISTS idx_profiles_active_session 
ON public.profiles(active_session_id);

-- Function to update session on login manually via frontend (Triggers removed to avoid conflicts)
CREATE OR REPLACE FUNCTION public.update_user_session(user_id UUID, session_token TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE public.profiles
  SET 
    active_session_id = session_token,
    session_created_at = NOW(),
    last_activity_at = NOW()
  WHERE id = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to validate if a session is the active one

-- Add RLS policy for session data (users can only see their own session info)
DO $$ BEGIN
    CREATE POLICY "Users can view own session info"
      ON public.profiles FOR SELECT
      USING (auth.uid() = id);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
