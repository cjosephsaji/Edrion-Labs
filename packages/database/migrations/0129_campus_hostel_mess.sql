-- Hostel mess menu read index.

CREATE INDEX IF NOT EXISTS hostel_mess_menus_date_idx
  ON hostel_mess_menus (institution_id, campus_id, menu_date DESC);
