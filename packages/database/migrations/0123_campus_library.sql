-- Campus library holds queue index.

CREATE INDEX IF NOT EXISTS library_holds_book_active_idx
  ON library_holds (book_id, created_at)
  WHERE status = 'active';
