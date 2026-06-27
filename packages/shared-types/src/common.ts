/** Shared primitive and envelope types used across API and frontend. */

/** Branded id helpers — prevent passing an institution id where a campus id is expected. */
export type Brand<T, B extends string> = T & { readonly __brand: B };
export type Uuid = string;
export type InstitutionId = Brand<Uuid, 'InstitutionId'>;
export type CampusId = Brand<Uuid, 'CampusId'>;
export type EmployeeId = Brand<Uuid, 'EmployeeId'>;
export type InstitutionUserId = Brand<Uuid, 'InstitutionUserId'>;
export type IndependentUserId = Brand<Uuid, 'IndependentUserId'>;
export type SubscriptionId = Brand<Uuid, 'SubscriptionId'>;
export type SupportSessionId = Brand<Uuid, 'SupportSessionId'>;

/** Money is always integer minor units (e.g. cents/paise) + currency. Never a float. */
import type { Currency } from './enums';
export interface Money {
  /** Integer minor units. 1999 = 19.99 in a 2-decimal currency. */
  amountMinor: number;
  currency: Currency;
}

/** ISO-8601 UTC timestamp string. */
export type IsoTimestamp = string;

/** Standard offset-paginated list envelope (directories). */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** Cursor-paginated envelope — for unbounded audit/activity streams. */
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** Uniform API error body. */
export interface ApiError {
  statusCode: number;
  code: string;
  message: string;
  /** Field-level validation messages, keyed by dotted path. */
  details?: Record<string, string[]>;
  correlationId?: string;
}

export interface SortSpec {
  field: string;
  direction: 'asc' | 'desc';
}

/** Context attached to every authorisation decision and audit event. */
export interface RequestContext {
  requestId: string;
  correlationId: string;
  ip?: string;
  userAgent?: string;
  /** Present only while inside an Edrion Support Access Session. */
  supportSessionId?: SupportSessionId;
}
