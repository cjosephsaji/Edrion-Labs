CREATE TABLE IF NOT EXISTS mfa_factors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  institution_user_id uuid REFERENCES institution_users(id) ON DELETE CASCADE,
  independent_user_id uuid REFERENCES independent_users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'totp',
  secret_encrypted text NOT NULL,
  label text,
  verified_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mfa_factors_owner_ck CHECK (
    (institution_user_id IS NOT NULL AND independent_user_id IS NULL)
    OR (institution_user_id IS NULL AND independent_user_id IS NOT NULL)
  )
);
