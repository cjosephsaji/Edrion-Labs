CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  institution_user_id uuid REFERENCES institution_users(id) ON DELETE CASCADE,
  independent_user_id uuid REFERENCES independent_users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mfa_recovery_codes_owner_ck CHECK (
    (institution_user_id IS NOT NULL AND independent_user_id IS NULL)
    OR (institution_user_id IS NULL AND independent_user_id IS NOT NULL)
  )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS mfa_recovery_codes_institution_user_idx
  ON mfa_recovery_codes (institution_user_id)
  WHERE institution_user_id IS NOT NULL;
