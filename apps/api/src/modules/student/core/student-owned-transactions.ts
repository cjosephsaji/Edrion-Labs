import { SetMetadata } from '@nestjs/common';

/** Only for services that scope every database operation themselves. Never client-controlled. */
export const STUDENT_OWNS_TRANSACTIONS = Symbol('student.owns-transactions');
export const StudentOwnsTransactions = () => SetMetadata(STUDENT_OWNS_TRANSACTIONS, true);

/** Method metadata overrides class metadata; both are server-authored. */
export function resolveOwnedTransactions(
  handler: object,
  controller: object,
): boolean {
  return (Reflect.getMetadata(STUDENT_OWNS_TRANSACTIONS, handler) ?? Reflect.getMetadata(STUDENT_OWNS_TRANSACTIONS, controller)) === true;
}
