import { SetMetadata } from '@nestjs/common';

/** Only for services that scope every database operation themselves. Never client-controlled. */
export const STUDENT_OWNS_TRANSACTIONS = Symbol('student.owns-transactions');
export const StudentOwnsTransactions = () => SetMetadata(STUDENT_OWNS_TRANSACTIONS, true);
