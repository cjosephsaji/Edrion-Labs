-- Principal dashboard prefs table (institution_user_dashboard_prefs) — index for portal load.

CREATE INDEX IF NOT EXISTS institution_user_dashboard_prefs_user_idx
  ON institution_user_dashboard_prefs (institution_user_id);
