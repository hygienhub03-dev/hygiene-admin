-- Migration 027: Allow admin users to read audit_log via RLS
-- The audit_log table had RLS enabled with zero policies,
-- meaning only service_role could access it.
-- Admins need read access from the mobile app (publishable key).

CREATE OR REPLACE FUNCTION public.fn_is_admin(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = uid AND role = 'admin'
  );
$$;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read audit_log"
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (public.fn_is_admin(auth.uid()));
