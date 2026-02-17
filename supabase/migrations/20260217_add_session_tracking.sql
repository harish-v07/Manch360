-- Add session tracking fields to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS active_session_id TEXT,
ADD COLUMN IF NOT EXISTS session_created_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

-- Create index for faster session lookups
CREATE INDEX IF NOT EXISTS idx_profiles_active_session 
ON public.profiles(active_session_id);

-- Function to update session on login
CREATE OR REPLACE FUNCTION public.update_user_session()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the user's active session information
  UPDATE public.profiles
  SET 
    active_session_id = NEW.id::TEXT,
    session_created_at = NEW.created_at,
    last_activity_at = NOW()
  WHERE id = NEW.user_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update session when user signs in
DROP TRIGGER IF EXISTS on_auth_session_created ON auth.sessions;
CREATE TRIGGER on_auth_session_created
  AFTER INSERT ON auth.sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_user_session();

-- Function to validate if a session is the active one
CREATE OR REPLACE FUNCTION public.is_active_session(user_id UUID, session_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  active_session TEXT;
BEGIN
  SELECT active_session_id INTO active_session
  FROM public.profiles
  WHERE id = user_id;
  
  RETURN active_session = session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clear session on logout
CREATE OR REPLACE FUNCTION public.clear_user_session()
RETURNS TRIGGER AS $$
BEGIN
  -- Clear the session info when user logs out
  UPDATE public.profiles
  SET 
    active_session_id = NULL,
    session_created_at = NULL,
    last_activity_at = NULL
  WHERE active_session_id = OLD.id::TEXT;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to clear session when user signs out
DROP TRIGGER IF EXISTS on_auth_session_deleted ON auth.sessions;
CREATE TRIGGER on_auth_session_deleted
  BEFORE DELETE ON auth.sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_user_session();

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
