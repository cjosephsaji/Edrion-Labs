import type { RequestTypeConfig } from './types';
import {
  campusLibraryRenewalPayloadSchema,
  campusLibraryRenewalRequestType,
  type CampusLibraryRenewalPayload,
} from './campus-library-renewal';

export const loanRenewalRequestType: RequestTypeConfig<CampusLibraryRenewalPayload> = {
  ...campusLibraryRenewalRequestType,
  key: 'loan_renewal',
  label: 'Renew library loan',
  humanCodePrefix: 'LN',
};

export { campusLibraryRenewalPayloadSchema as loanRenewalPayloadSchema };
