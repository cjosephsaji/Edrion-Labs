'use client';
import { Drawer } from '@edrion/ui';
import type { LibraryBookRow } from '@/lib/library-types';
import { BookLoansPanel } from './book-loans-panel';

/** @deprecated Prefer `BookLoansPanel` in the book detail popup. */
export function BookLoansDrawer({
  book,
  open,
  onClose,
}: {
  book: LibraryBookRow | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Drawer open={open} onClose={onClose} title="Loans" description={book?.title ?? ''}>
      {book && (
        <BookLoansPanel
          bookId={book.id}
          title={book.title}
          totalCopies={book.totalCopies}
          availableCopies={book.availableCopies}
          activeLoans={book.activeLoans}
        />
      )}
    </Drawer>
  );
}

export { BookLoansPanel } from './book-loans-panel';
