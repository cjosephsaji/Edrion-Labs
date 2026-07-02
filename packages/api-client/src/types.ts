import type {
  CursorPage,
  InstitutionStatus,
  InstitutionType,
  OnboardingStatus,
  PaginatedResult,
  RegistrationReviewAction,
  RegistrationStatus,
  SupportTier,
} from '@edrion/shared-types';

/** DTOs the API returns. Kept explicit so the frontend stays decoupled from the ORM. */
export interface InstitutionDto {
  id: string;
  publicId: string;
  legalName: string;
  displayName: string;
  type: InstitutionType;
  logoUrl: string | null;
  country: string;
  region: string | null;
  status: InstitutionStatus;
  onboardingStatus: OnboardingStatus;
  supportTier: SupportTier;
  riskFlags: string[] | null;
  trialEndsAt: string | null;
  activatedAt: string | null;
  customerSuccessOwnerId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type InstitutionList = PaginatedResult<InstitutionDto>;
export type InstitutionStatusSummary = Record<string, number>;

export interface CampusDto {
  id: string;
  institutionId: string;
  name: string;
  code: string;
  billingStatus: string;
  isActive: boolean;
  /** Per-campus add-on price (minor units); null when included in the base allowance. */
  addonPriceMinor: number | null;
  customDiscountBps: number | null;
  currentUserCount: number;
  effectiveBillingDate: string | null;
  suspendedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type CampusList = PaginatedResult<CampusDto>;

/** Result of creating a campus — the row plus the charge that was applied. */
export interface CreateCampusResult {
  campus: CampusDto;
  charge: CampusChargeBreakdownDto;
}

export interface CampusChargeBreakdownDto {
  includedInBase: boolean;
  currency: string;
  listPriceMinor: number;
  discountMinor: number;
  prorationFactor: number;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  effectiveDate: string;
  nextInvoiceImpactMinor: number;
}

export interface SupportAccessSessionDto {
  id: string;
  institutionId: string;
  institutionName: string | null;
  employeeId: string;
  employeeName: string;
  employeeRole: string | null;
  accessLevel: string;
  reason: string;
  caseRef: string | null;
  campusId: string | null;
  status: 'requested' | 'approved' | 'active' | 'ended' | 'expired';
  riskLevel: string;
  requestedAt: string;
  approvedAt: string | null;
  startedAt: string | null;
  expiresAt: string;
  endedAt: string | null;
  durationMinutes: number;
  createdAt: string;
}

export type SupportAccessSessionList = PaginatedResult<SupportAccessSessionDto>;

// --- Institution users -------------------------------------------------------

export interface InstitutionUserListItemDto {
  id: string;
  institutionId: string;
  email: string;
  fullName: string;
  status: string;
  mfaEnrolled: boolean;
  requireMfa: boolean;
  invitedAt: string | null;
  lastLoginAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  roleKeys: string[];
  campusCount: number;
}

export type InstitutionUserList = PaginatedResult<InstitutionUserListItemDto>;
export type InstitutionUserStatusSummary = Record<string, number>;

export interface CampusGrantDto {
  campusId: string;
  campusName?: string | null;
  accessLevel: string;
}

export interface EffectiveAccessDto {
  roleKeys: string[];
  permissionKeys: string[];
  grantedByRole: string[];
  addedByOverride: string[];
  removedByOverride: string[];
  campusAccess: { campusId: string; accessLevel: string }[];
  campusCount: number;
}

export interface InstitutionUserDetailDto {
  id: string;
  institutionId: string;
  email: string;
  fullName: string;
  phone: string | null;
  status: string;
  mfaEnrolled: boolean;
  requireMfa: boolean;
  invitedAt: string | null;
  lastLoginAt: string | null;
  passwordResetRequiredAt: string | null;
  sessionsRevokedAt: string | null;
  lockedAt: string | null;
  disabledAt: string | null;
  disabledReason: string | null;
  directGrants: string[];
  directDenies: string[];
  roleKeys: string[];
  campusAccess: CampusGrantDto[];
  effectiveAccess: EffectiveAccessDto;
  history: { event: string; at: string }[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface AccessPreviewDto {
  before: EffectiveAccessDto;
  after: EffectiveAccessDto;
}

// --- Plans -------------------------------------------------------------------

export interface PlanVersionDto {
  id: string;
  planId: string;
  version: number;
  status: string;
  currency: string;
  monthlyPriceMinor: number;
  annualPriceMinor: number;
  baseCampusAllowance: number;
  perCampusPriceMinor: number;
  usageLimits: Record<string, number>;
  featureEntitlements: Record<string, boolean>;
  trialDays: number;
  supportTier: string;
  note: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
}

export interface PlanListItemDto {
  id: string;
  key: string;
  name: string;
  description: string | null;
  audience: string;
  status: string;
  version: number;
  versionCount: number;
  latestVersion: number | null;
  currency: string | null;
  monthlyPriceMinor: number | null;
  baseCampusAllowance: number | null;
  createdAt: string;
  updatedAt: string;
}

export type PlanList = PaginatedResult<PlanListItemDto>;
export type PlanStatusSummary = Record<string, number>;

export interface PlanDetailDto {
  id: string;
  key: string;
  name: string;
  description: string | null;
  audience: string;
  status: string;
  version: number;
  versions: PlanVersionDto[];
  publishedVersionId: string | null;
  liveSubscriptionCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Pricing payload shared by create-draft + new-version forms (mirrors the Zod schema). */
export interface PlanVersionPricingPayload {
  currency: string;
  monthlyPriceMinor: number;
  annualPriceMinor: number;
  baseCampusAllowance: number;
  perCampusPriceMinor: number;
  usageLimits: Record<string, number>;
  featureEntitlements: Record<string, boolean>;
  trialDays: number;
  supportTier: string;
}

// --- Subscriptions -----------------------------------------------------------

export interface SubscriptionAddonDto {
  id: string;
  kind: string;
  campusId: string | null;
  quantity: number;
  unitPriceMinor: number;
  active: boolean;
  effectiveDate: string;
}

export interface SubscriptionListItemDto {
  id: string;
  institutionId: string | null;
  institutionName: string | null;
  planName: string | null;
  planKey: string | null;
  status: string;
  billingCycle: string;
  currency: string;
  basePriceMinor: number;
  periodEnd: string;
  trialEndsAt: string | null;
  version: number;
}

export type SubscriptionList = PaginatedResult<SubscriptionListItemDto>;
export type SubscriptionStatusSummary = Record<string, number>;

export interface SubscriptionDetailDto extends SubscriptionListItemDto {
  planId: string | null;
  planVersionId: string;
  planVersionNumber: number | null;
  listPriceMinor: number;
  overridePriceMinor: number | null;
  perCampusPriceMinor: number;
  institutionPerCampusPriceMinor: number | null;
  discountBps: number;
  creditBalanceMinor: number;
  overagePolicy: string;
  baseCampusAllowance: number | null;
  campusCount: number;
  usageLimits: Record<string, number>;
  periodStart: string;
  pausedAt: string | null;
  cancelAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  gracePeriodEndsAt: string | null;
  scheduledPlanVersionId: string | null;
  scheduledBillingCycle: string | null;
  scheduledChangeAt: string | null;
  addons: SubscriptionAddonDto[];
  createdAt: string;
  updatedAt: string;
}

export interface PlanChangeProrationDto {
  currency: string;
  prorationFactor: number;
  creditUnusedMinor: number;
  chargeNewMinor: number;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  isCredit: boolean;
  effectiveDate: string;
  nextInvoiceImpactMinor: number;
}

// --- Billing ------------------------------------------------------------------

export interface InvoiceDto {
  id: string;
  number: string | null;
  institutionId: string;
  institutionName?: string | null;
  subscriptionId: string | null;
  status: string;
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  amountPaidMinor: number;
  amountDueMinor: number;
  dunningState: string;
  attemptCount: number;
  periodStart: string | null;
  periodEnd: string | null;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  version: number;
  createdAt: string;
}

export type InvoiceList = PaginatedResult<InvoiceDto>;

export interface InvoiceItemDto {
  id: string;
  invoiceId: string;
  kind: string;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  amountMinor: number;
}

export interface PaymentDto {
  id: string;
  institutionId: string;
  invoiceId: string | null;
  status: string;
  method: string;
  amountMinor: number;
  currency: string;
  provider: string;
  providerRef: string | null;
  failureReason: string | null;
  processedAt: string | null;
  createdAt: string;
}

export type PaymentList = PaginatedResult<PaymentDto>;

export interface InvoiceDetailDto extends InvoiceDto {
  items: InvoiceItemDto[];
  payments: PaymentDto[];
}

export interface RefundDto {
  id: string;
  paymentId: string;
  institutionId: string;
  amountMinor: number;
  currency: string;
  reason: string | null;
  status: string;
  createdAt: string;
}

export interface CreditDto {
  id: string;
  institutionId: string;
  amountMinor: number;
  remainingMinor: number;
  currency: string;
  reason: string | null;
  source: string;
  expiresAt: string | null;
  createdAt: string;
}

export type CreditList = PaginatedResult<CreditDto>;

export interface DiscountDto {
  id: string;
  code: string | null;
  name: string;
  institutionId: string | null;
  kind: string;
  valueBps: number | null;
  valueMinor: number | null;
  currency: string | null;
  appliesTo: string;
  active: boolean;
  createdAt: string;
}

export type DiscountList = PaginatedResult<DiscountDto>;

export interface BillingSummaryDto {
  outstandingMinor: number;
  paidMinor: number;
  openCount: number;
  creditBalanceMinor: number;
}

export interface EntitlementsDto {
  institutionId: string;
  subscriptionId: string;
  status: string;
  planName: string | null;
  planVersion: number;
  supportTier: string;
  baseCampusAllowance: number;
  campusCount: number;
  features: Record<string, boolean>;
  usageLimits: Record<string, number>;
}

export interface CurrentEmployee {
  employeeId: string;
  email: string;
  fullName: string;
  roleKeys: string[];
  mfaEnrolled: boolean;
  permissions: string[];
}

// --- Feature controls --------------------------------------------------------

export interface FeatureDefinitionDto {
  id: string;
  key: string;
  name: string;
  description: string | null;
  module: string;
  status: string;
  defaultValue: boolean;
  availableScopes: string[] | null;
  dependencies: string[] | null;
  releaseStage: string;
  owner: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type FeatureList = PaginatedResult<FeatureDefinitionDto>;
export type FeatureStatusSummary = Record<string, number>;

export interface FeatureAssignmentDto {
  id: string;
  featureId: string;
  scope: string;
  scopeId: string | null;
  value: boolean;
  enabled: boolean;
  activatesAt: string | null;
  expiresAt: string | null;
  reason: string | null;
  setByName: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface FeatureRolloutDto {
  id: string;
  featureId: string;
  type: string;
  enabled: boolean;
  percentage: number | null;
  allowList: string[] | null;
  blockList: string[] | null;
  environments: string[] | null;
  startsAt: string | null;
  endsAt: string | null;
  reason: string | null;
  setByName: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface FeatureDetailDto {
  definition: FeatureDefinitionDto;
  assignments: FeatureAssignmentDto[];
  rollouts: FeatureRolloutDto[];
}

export interface FeatureResolutionTraceEntryDto {
  layer: string;
  scope?: string;
  scopeId?: string | null;
  applied: boolean;
  value?: boolean;
  note: string;
}

/** Effective-Value preview payload — winning layer + reason, not just a boolean. */
export interface FeatureResolutionDto {
  key: string;
  value: boolean;
  layer: string;
  scope?: string;
  scopeId?: string | null;
  reason: string;
  killSwitchActive: boolean;
  trace: FeatureResolutionTraceEntryDto[];
}

// --- Analytics ---------------------------------------------------------------

export interface DashboardAggregatesDto {
  institutions: Record<string, number>;
  subscriptions: Record<string, number>;
  billing: {
    outstandingMinor: number;
    paidMinor: number;
    openInvoices: number;
    creditBalanceMinor: number;
  };
  users: { institutionUsers: number; independentUsers: number };
  revenue: { recurringMonthlyMinor: number };
}

export interface PendingActionItemDto {
  id: string;
  priority: 'critical' | 'today' | 'upcoming' | 'informational';
  category: string;
  title: string;
  description: string;
  href: string;
}

export interface PendingActionsDto {
  groups: Record<string, PendingActionItemDto[]>;
  total: number;
}

// --- Audit + activity --------------------------------------------------------

export interface AuditEventDto {
  id: string;
  occurredAt: string;
  actorType: string;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  institutionId: string | null;
  institutionName: string | null;
  campusId: string | null;
  supportSessionId: string | null;
  caseRef: string | null;
  action: string;
  module: string;
  entityType: string | null;
  entityId: string | null;
  previousState: Record<string, unknown> | null;
  newState: Record<string, unknown> | null;
  reason: string | null;
  result: string;
  riskLevel: string;
  errorDetail: string | null;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  correlationId: string | null;
  apiEndpoint: string | null;
  aiInvolved: boolean;
  aiRunId: string | null;
}

export type AuditEventPage = CursorPage<AuditEventDto>;

export interface ActivityEventDto {
  id: string;
  occurredAt: string;
  category: string;
  actorName: string | null;
  summary: string;
  institutionId: string | null;
  entityType: string | null;
  entityId: string | null;
  riskLevel: string;
  metadata: Record<string, unknown> | null;
}

export type ActivityEventPage = CursorPage<ActivityEventDto>;

// --- AI governance ------------------------------------------------------------

export interface AiPolicyDto {
  id: string;
  scope: string;
  scopeId: string | null;
  enabled: boolean;
  mode: string;
  capabilities: Record<string, boolean> | null;
  maxFinancialImpactMinor: number | null;
  maxAffectedUsers: number | null;
  twoPersonThresholdMinor: number | null;
  secondApproverCapabilities: string[] | null;
  killSwitch: boolean;
  reason: string | null;
  setByName: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type AiPolicyList = PaginatedResult<AiPolicyDto>;

export interface AiActionRuleDto {
  id: string;
  capability: string;
  action: string | null;
  enabled: boolean;
  effect: string;
  riskLevel: string | null;
  description: string | null;
  reason: string | null;
  setByName: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface AiGovernanceOverviewDto {
  globalMode: string;
  killSwitchActive: boolean;
  killSwitchScopes: { scope: string; scopeId: string | null }[];
  capabilities: Record<string, boolean>;
  maxFinancialImpactMinor: number | null;
  maxAffectedUsers: number | null;
  twoPersonThresholdMinor: number | null;
  secondApproverCapabilities: string[];
  policyCount: number;
  ruleCount: number;
}

export interface EffectiveAiPolicyDto {
  mode: string;
  capabilities: Record<string, boolean>;
  maxFinancialImpactMinor: number | null;
  maxAffectedUsers: number | null;
  twoPersonThresholdMinor: number | null;
  secondApproverCapabilities: string[];
  killSwitch: boolean;
  modeScope: string;
  modeScopeId: string | null;
  killSwitchScope?: string;
  killSwitchSetByName?: string | null;
}

export interface GuardrailTraceEntryDto {
  layer: string;
  applied: boolean;
  decision?: string;
  note: string;
}

/** Guardrail evaluation outcome — deciding rule + reason, never a bare flag. */
export interface GuardrailResultDto {
  decision: 'allow' | 'needs_confirmation' | 'needs_second_approver' | 'blocked';
  layer: string;
  reason: string;
  capability: string;
  action: string;
  requiredPermission?: string;
  riskLevel: string;
  requiresSecondApprover: boolean;
  killSwitchActive: boolean;
  policy: EffectiveAiPolicyDto;
  trace: GuardrailTraceEntryDto[];
}

// --- Copilot run lifecycle ----------------------------------------------------

export interface AiRunDto {
  id: string;
  employeeId: string;
  employeeName: string | null;
  prompt: string;
  context: Record<string, unknown> | null;
  contextSources: string[] | null;
  status: 'proposed' | 'awaiting_confirmation' | 'confirmed' | 'executed' | 'rejected' | 'expired' | 'failed';
  summary: string | null;
  model: string;
  promptVersion: string | null;
  riskLevel: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number | null;
  errorDetail: string | null;
  startedAt: string;
  completedAt: string | null;
  expiresAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type AiRunPage = CursorPage<AiRunDto>;

export interface AiToolCallDto {
  id: string;
  runId: string;
  toolKey: string;
  capability: string;
  args: Record<string, unknown> | null;
  explanation: string | null;
  requiredPermission: string | null;
  decision: 'allow' | 'needs_confirmation' | 'needs_second_approver' | 'blocked';
  decisionLayer: string | null;
  decisionReason: string | null;
  riskLevel: string | null;
  reversible: boolean;
  financialImpactMinor: number | null;
  affectedUsers: number | null;
  impactPreview: Record<string, unknown> | null;
  status: string;
  result: Record<string, unknown> | null;
  auditEventId: string | null;
  errorDetail: string | null;
  executedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiConfirmationDto {
  id: string;
  runId: string;
  employeeId: string;
  employeeName: string | null;
  method: string;
  confirmationText: string | null;
  reason: string | null;
  createdAt: string;
}

export interface AiApprovalDto {
  id: string;
  runId: string;
  approverId: string;
  approverName: string | null;
  approved: boolean;
  reason: string | null;
  createdAt: string;
}

export interface AiRunDetailDto {
  run: AiRunDto;
  toolCalls: AiToolCallDto[];
  confirmations: AiConfirmationDto[];
  approvals: AiApprovalDto[];
  auditEvents: AuditEventDto[];
}

// --- System health -----------------------------------------------------------

export interface SupportCaseDto {
  id: string;
  publicId: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  institutionId: string | null;
  independentUserId: string | null;
  assignedEmployeeId: string | null;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportMessageDto {
  id: string;
  caseId: string;
  authorType: string;
  authorId: string | null;
  body: string;
  internal: { note: boolean } | null;
  createdAt: string;
}

export interface SupportCaseList {
  items: SupportCaseDto[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface SupportCaseDetailDto {
  case: SupportCaseDto;
  messages: SupportMessageDto[];
}

export interface IndependentUserDto {
  id: string;
  email: string;
  fullName: string;
  country: string | null;
  signupSource: string | null;
  status: string;
  lastActivityAt: string | null;
  aiUsageLimit: number | null;
  riskFlags: string[] | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface IndependentUserList {
  items: IndependentUserDto[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// --- Employees + platform roles ----------------------------------------------

export interface EmployeeDto {
  id: string;
  email: string;
  fullName: string;
  title: string | null;
  status: string;
  mfaEnrolled: boolean;
  lastLoginAt: string | null;
  lastAuthAt: string | null;
  avatarUrl: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  /** Present on list rows. */
  roleCount?: number;
  overrideCount?: number;
}

export interface EmployeeList {
  items: EmployeeDto[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface PlatformRoleDto {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
}

export interface EmployeeOverrideDto {
  id: string;
  permissionKey: string;
  granted: boolean;
  reason: string | null;
}

export interface EmployeeDetailDto {
  employee: EmployeeDto;
  roles: PlatformRoleDto[];
  overrides: EmployeeOverrideDto[];
}

export interface RoleWithMetaDto extends PlatformRoleDto {
  permissionKeys: string[];
  memberCount: number;
}

export interface PlatformRoleList {
  items: RoleWithMetaDto[];
}

export interface PermissionCatalogEntryDto {
  key: string;
  group: string;
  description: string;
  sensitive: boolean;
}

export interface PermissionCatalogue {
  items: PermissionCatalogEntryDto[];
}

// --- Integrations / webhooks -------------------------------------------------

export interface WebhookEndpointDto {
  id: string;
  institutionId: string | null;
  url: string;
  description: string | null;
  events: string[];
  active: boolean;
  version: number;
  /** Masked secret for display. The full secret is returned only on create/rotate. */
  secretHint: string;
  secret?: string;
  deliveryCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDeliveryDto {
  id: string;
  endpointId: string;
  eventType: string;
  status: string;
  attempts: number;
  responseStatus: number | null;
  lastError: string | null;
  createdAt: string;
}

export interface WebhookEndpointList {
  items: WebhookEndpointDto[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface WebhookEndpointDetailDto {
  endpoint: WebhookEndpointDto;
  deliveries: WebhookDeliveryDto[];
}

export interface TestDeliveryResultDto {
  enqueued: boolean;
  jobId?: string | null;
  delivery?: WebhookDeliveryDto | null;
}

export interface BackgroundJobRunDto {
  id: string;
  name: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  itemsProcessed: number;
  error: string | null;
}

export interface QueueCountsDto {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface SystemHealthDto {
  status: string;
  time: string;
  api: { status: string; uptimeSeconds: number; version: string; node: string };
  database: { status: string; latencyMs: number; version: string };
  redis: { status: string };
  records: {
    institutions: number;
    subscriptions: number;
    auditEvents: number;
    activeSupportSessions: number;
  };
  jobs: {
    latest: Array<{
      name: string;
      status: string;
      startedAt: string;
      durationMs: number | null;
      itemsProcessed: number;
    }>;
    recent: BackgroundJobRunDto[];
  };
  queues: QueueCountsDto[];
}

// ── Institution registration & approval ──────────────────────────────────────

export interface RegInstitutionInfoDto {
  legalName: string;
  displayName: string;
  type: InstitutionType;
  website?: string;
  yearEstablished?: number;
  registrationNumber?: string;
  logoUrl?: string;
}
export interface RegLocationDto {
  country: string;
  region?: string;
  city: string;
  address: string;
  postalCode?: string;
  timezone: string;
}
export interface RegCampusInfoDto {
  currentCampuses: number;
  expectedCampusesNextYear?: number;
  firstCampusName: string;
  expectedStudents: number;
  expectedStaff?: number;
}
export interface RegPrimaryContactDto {
  fullName: string;
  jobTitle?: string;
  email: string;
  phone?: string;
  preferredContactMethod?: string;
}
export interface RegSubscriptionDto {
  preferredPlan?: string;
  launchTimeline?: string;
  currentErp?: string;
  hearAboutUs?: string;
  additionalRequirements?: string;
}
export interface RegConsentDto {
  termsAccepted: boolean;
  privacyAccepted: boolean;
  marketingOptIn?: boolean;
  acceptedAt?: string;
}

export interface RegistrationRequestDto {
  id: string;
  publicRef: string | null;
  status: RegistrationStatus;
  legalName: string | null;
  displayName: string | null;
  type: InstitutionType | null;
  country: string | null;
  region: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  campusesCount: number | null;
  expectedStudents: number | null;
  preferredPlanKey: string | null;
  institutionInfo: RegInstitutionInfoDto | null;
  location: RegLocationDto | null;
  campusInfo: RegCampusInfoDto | null;
  primaryContact: RegPrimaryContactDto | null;
  subscription: RegSubscriptionDto | null;
  consent: RegConsentDto | null;
  emailVerifiedAt: string | null;
  verifiedEmail: string | null;
  assignedReviewerId: string | null;
  decidedBy: string | null;
  decisionAt: string | null;
  rejectionReason: string | null;
  linkedInstitutionId: string | null;
  submittedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type RegistrationList = PaginatedResult<RegistrationRequestDto>;
export type RegistrationStatusSummary = Record<string, number>;

export interface RegistrationReviewDto {
  id: string;
  requestId: string;
  reviewerId: string | null;
  action: RegistrationReviewAction;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  rejectionReason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface RegistrationAuditEventDto {
  id: string;
  action: string;
  actorType: string;
  actorName: string | null;
  result: string;
  riskLevel: string;
  ip: string | null;
  occurredAt: string;
  previousState: Record<string, unknown> | null;
  newState: Record<string, unknown> | null;
}

export interface RegistrationDetailDto {
  request: RegistrationRequestDto;
  reviews: RegistrationReviewDto[];
  auditEvents: RegistrationAuditEventDto[];
}

export interface RegistrationApprovalResultDto {
  institutionId: string;
  institutionPublicId: string;
  adminUserId: string;
  publicRef: string | null;
}
