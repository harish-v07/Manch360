-- ============================================================
-- Admin RLS Policies + Seed vharish7100@gmail.com as admin
-- ============================================================

-- 1. Allow admins to update any profile's status/role fields
DO $$ BEGIN
  CREATE POLICY "Admins can update any profile"
    ON public.profiles FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'admin'
      )
    );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Allow admins to read all profiles
DO $$ BEGIN
  CREATE POLICY "Admins can read all profiles"
    ON public.profiles FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'admin'
      )
    );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3. Allow admins to update any user_role
DO $$ BEGIN
  CREATE POLICY "Admins can update any user role"
    ON public.user_roles FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM public.user_roles ur2
        WHERE ur2.user_id = auth.uid() AND ur2.role = 'admin'
      )
    );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 4. Allow admins to read all user_roles
DO $$ BEGIN
  CREATE POLICY "Admins can read all user roles"
    ON public.user_roles FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.user_roles ur2
        WHERE ur2.user_id = auth.uid() AND ur2.role = 'admin'
      )
    );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 5. Seed vharish7100@gmail.com as admin role
-- This is safe to run multiple times (upserts on conflict)
DO $$
DECLARE
  target_user_id UUID;
BEGIN
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = 'vharish7100@gmail.com'
  LIMIT 1;

  IF target_user_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (target_user_id, 'admin')
    ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
    
    RAISE LOG 'Successfully set admin role for vharish7100@gmail.com';
  ELSE
    RAISE LOG 'User vharish7100@gmail.com not found - will be set to admin on first login via trigger';
  END IF;
END $$;
