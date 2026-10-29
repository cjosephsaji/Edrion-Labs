import type {
  CursorPage,
  InstitutionStatus,
  InstitutionType,
  OnboardingStatus,
  PaginatedResult,
  RegistrationReviewAction,
  RegistrationStatus,
  SupportTier,
} from "@edrion/shared-types";

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
  status: "requested" | "approved" | "active" | "ended" | "expired";
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
  priority: "critical" | "today" | "upcoming" | "informational";
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
  decision:
    | "allow"
    | "needs_confirmation"
    | "needs_second_approver"
    | "blocked";
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

// --- Petros AI routing -------------------------------------------------------

export interface PetrosAiOverviewDto {
  providerCount: number;
  healthyProviderCount: number;
  configuredFunctionCount: number;
  functionCount: number;
  enabledRuleCount: number;
  monthlyCostMicros: number;
  monthlyBudgetMicros: number | null;
  failureRate: number;
  averageResponseMs: number;
  fallbackRate: number;
}

export interface PetrosAiModelDto {
  id: string;
  providerId: string;
  modelKey: string;
  displayName: string;
  enabled: boolean;
  custom: boolean;
  capabilities: string[];
  contextWindow: number | null;
  maxOutputTokens: number | null;
  pricing: Record<string, number>;
  providerOptions: Record<string, unknown>;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PetrosAiProviderDto {
  id: string;
  key: string;
  displayName: string;
  adapterType: string;
  baseUrl: string | null;
  credentialHint: string | null;
  credentialConfigured: boolean;
  enabled: boolean;
  paused: boolean;
  priority: number;
  dailyBudgetMicros: number | null;
  monthlyBudgetMicros: number | null;
  capabilities: string[];
  metadata: Record<string, unknown>;
  healthStatus: string;
  latencyMs: number | null;
  lastHealthCheckAt: string | null;
  lastHealthError: string | null;
  version: number;
  models: PetrosAiModelDto[];
  createdAt: string;
  updatedAt: string;
}

export interface PetrosAiFunctionSettingsDto {
  maxInputTokens: number;
  maxOutputTokens: number;
  temperature: number;
  reasoningLevel?: string;
  timeoutMs: number;
  maxRetries: number;
  streaming: boolean;
  caching: boolean;
  dailyRequestLimit?: number;
  monthlyRequestLimit?: number;
  maxCostPerRequestMicros?: number;
  maxCostPerStudentMicros?: number;
  maxInstitutionUsage?: number;
}

export interface PetrosAiFunctionRouteDto {
  id: string;
  functionId: string;
  providerId: string;
  modelId: string;
  tier: number;
  trafficPercent: number;
  enabled: boolean;
  overrides: Record<string, unknown>;
  providerKey: string;
  providerName: string;
  providerEnabled: boolean;
  providerPaused: boolean;
  modelKey: string;
  modelName: string;
  modelEnabled: boolean;
  modelCapabilities: string[];
}

export interface PetrosAiFunctionDto {
  id: string;
  key: string;
  displayName: string;
  description: string;
  category: string;
  enabled: boolean;
  allowedInputTypes: string[];
  responseFormat: string;
  requiredCapabilities: string[];
  settings: PetrosAiFunctionSettingsDto;
  activePromptVersion: string;
  activeSchemaVersion: string;
  source: string;
  version: number;
  routes: PetrosAiFunctionRouteDto[];
  createdAt: string;
  updatedAt: string;
}

export interface PetrosAiRoutingRuleDto {
  id: string;
  name: string;
  description: string | null;
  functionId: string | null;
  functionKey: string | null;
  priority: number;
  enabled: boolean;
  conditions: {
    all?: Array<{ field: string; operator: string; value: unknown }>;
    any?: Array<{ field: string; operator: string; value: unknown }>;
  };
  action: {
    kind: string;
    providerId?: string;
    modelId?: string;
    maxTier?: number;
    reason?: string;
  };
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PetrosAiUsageSummaryDto {
  from: string;
  to: string;
  totals: {
    requests: number;
    attempts: number;
    successful: number;
    failures: number;
    fallbacks: number;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    costMicros: number;
    averageResponseMs: number;
  };
  breakdown: Array<{
    label: string;
    requests: number;
    attempts: number;
    successes: number;
    costMicros: number;
    averageResponseMs: number;
  }>;
}

export interface PetrosAiBudgetPolicyDto {
  id: string;
  scope: string;
  scopeId: string | null;
  monthlyBudgetMicros: number | null;
  dailyBudgetMicros: number | null;
  thresholds: Array<{ percent: number; action: string }>;
  preserveEssentialFunctions: boolean;
  enabled: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PetrosRoutePreviewDto {
  selected: {
    providerId: string;
    providerKey: string;
    providerName: string;
    modelId: string;
    modelKey: string;
    modelName: string;
    tier: number;
  };
  attempts: Array<{
    providerId: string;
    providerKey: string;
    providerName: string;
    modelId: string;
    modelKey: string;
    modelName: string;
    tier: number;
  }>;
  matchedRules: Array<{ id: string; name: string; action: string }>;
  budgetAction: string;
  cacheAllowed: boolean;
  explanation: string[];
}

export interface PetrosDecisionDiagnosticDto {
  id: string;
  sessionId: string;
  institutionRef: string;
  studentRef: string;
  sequence: number;
  moveType: string;
  originalMoveType: string | null;
  status: string;
  studentSafeReason: string;
  decisionFactors: string[];
  expectedEvidence: string;
  policyInterventions: Array<Record<string, unknown>>;
  selectionPolicy: {
    normalizedCandidateWeights: Record<string, number>;
    exclusions: Array<{ move: string; reason: string }>;
    selectedWeight: number;
    override: Record<string, unknown> | null;
    capabilityFallback: string | null;
  };
  source: "ai" | "deterministic_fallback";
  functionKey: string;
  promptVersion: string;
  schemaVersion: string;
  routeReference: Record<string, unknown> | null;
  planRequestId: string | null;
  renderRequestId: string | null;
  resultingBlockId: string | null;
  correlationId: string;
  createdAt: string;
}

export interface PetrosTopicProfileContentDto {
  schemaVersion: string;
  identity: {
    topicKey: string;
    canonicalTitle: string;
    subjectKey: string;
    subjectLabel: string;
    gradeBand: string;
    curriculumKey: string;
    curriculumLabel: string;
    syllabusReferences: Array<{
      label: string;
      reference: string | null;
      licence: string | null;
    }>;
  };
  dimensions: {
    knowledgeTypes: Array<{ type: string; weightBasisPoints: number }>;
    abstractionLevel: number;
    representations: Array<{ type: string; weightBasisPoints: number }>;
    prerequisiteDensity: number;
    prerequisites: Array<{
      conceptKey: string;
      label: string;
      requiredness: string;
      sourceReferences: Array<Record<string, unknown>>;
    }>;
    misconceptionRichness: number;
    misconceptions: Array<{
      key: string;
      summary: string;
      correctionAnchor: string;
      sourceReferences: Array<Record<string, unknown>>;
    }>;
    mathematicalLoad: number;
    memorisationLoad: number;
    realWorldAnchors: {
      availability: number;
      quality: number;
      examples: string[];
    };
    moves: {
      required: string[];
      recommended: string[];
      disallowed: string[];
      weights: Record<string, number>;
      openingPattern: string[];
      practicePattern: string[];
      closingPattern: string[];
    };
  };
  provenance: {
    source: string;
    confidenceBasisPoints: number;
    generatorVersion: string;
    promptVersion: string;
    sourceReferences: Array<Record<string, unknown>>;
    reviewer: string | null;
    reviewedAt: string | null;
  };
  cache: {
    key: string;
    version: number;
    invalidationInputs: Record<string, string>;
  };
}

export interface PetrosTopicProfileVersionDto {
  id: string;
  version: number;
  status: string;
  source: string;
  profile: PetrosTopicProfileContentDto;
  profileHash: string;
  changeSummary: string;
  generatedRequestId: string | null;
  createdBy: string | null;
  reviewedBy: string | null;
  createdAt: string;
  publishedAt: string | null;
}

export interface PetrosTopicProfileDto {
  id: string;
  learnTopicId: string | null;
  topicKey: string;
  canonicalTitle: string;
  subjectKey: string;
  subjectLabel: string;
  gradeBand: string;
  curriculumKey: string;
  curriculumLabel: string;
  status: "draft" | "published" | "stale" | "archived";
  cacheKey: string;
  cacheVersion: number;
  cacheHitCount: number;
  staleReason: string | null;
  version: number;
  publishedVersion: PetrosTopicProfileVersionDto | null;
  latestVersion: PetrosTopicProfileVersionDto | null;
  versions: PetrosTopicProfileVersionDto[];
  overrides: Array<{
    id: string;
    institutionId: string;
    version: number;
    status: string;
    patch: { dimensions: Partial<PetrosTopicProfileContentDto["dimensions"]> };
    basedOnCanonicalVersion: number;
    createdAt: string;
    publishedAt: string | null;
  }>;
  prerequisites: PetrosTopicProfileContentDto["dimensions"]["prerequisites"];
  misconceptions: PetrosTopicProfileContentDto["dimensions"]["misconceptions"];
  auditHistory: Array<{
    id: string;
    action: string;
    actorRef: string | null;
    reason: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface PetrosObservationDiagnosticDto {
  id: string;
  sessionId: string;
  institutionRef: string;
  studentRef: string;
  type: string;
  targetId: string | null;
  decisionId: string | null;
  blockId: string | null;
  questionId: string | null;
  confidence: "sure" | "think_so" | "guessing" | null;
  correctness: "correct" | "incorrect" | "partial" | "invalid" | null;
  credit: number | null;
  highValueMisconception: boolean;
  fragileSuccess: boolean;
  errorClass: string | null;
  evaluator: "deterministic" | "ai" | "safe_fallback" | null;
  functionKey: string | null;
  promptVersion: string | null;
  schemaVersion: string;
  requestId: string | null;
  routeReference: Record<string, unknown> | null;
  correlationId: string;
  ladderLevel: number | null;
  supportKind: string | null;
  occurredAt: string;
}

export interface PetrosQualityRunDto {
  id: string;
  externalRunId: string;
  label: string;
  status: "completed" | "failed" | "cancelled";
  mode: "fixture" | "live";
  source: "evaluation";
  environment: "evaluation";
  suite: string;
  seed: number;
  gate: "pass" | "warn" | "fail";
  corpusVersion: string;
  rubricVersion: string;
  promptVersion: string;
  schemaVersion: string;
  profileVersion: string;
  routingVersion: string;
  codeVersion: string;
  totals: Record<string, number>;
  dimensions: Record<string, { mean: number; count: number }>;
  blockingFailures: string[];
  warnings: string[];
  comparison: Record<string, unknown> | null;
  report: Record<string, unknown>;
  costMicros: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
}

export interface PetrosQualityRunDetailDto extends PetrosQualityRunDto {
  sessions: Array<{
    id: string;
    externalSessionId: string;
    caseId: string;
    topicKey: string;
    topicTitle: string;
    subject: string;
    personaId: string;
    goal: string;
    totalScoreBasisPoints: number;
    status: string;
    blockingFailures: string[];
    warnings: string[];
    transcript: {
      moves?: Array<{
        id: string;
        blockId: string;
        type: string;
        phase: string;
        title: string;
        content: string;
        studentSafeReason: string;
        decisionFactors: string[];
      }>;
      observations?: Array<{
        id: string;
        moveId: string;
        type: string;
        correctness?: string;
        confidence?: string;
        summary: string;
      }>;
      usage?: Array<{
        functionKey: string;
        providerKey: string;
        modelKey: string;
        costMicros: number;
        latencyMs: number;
        validationFailures: number;
      }>;
      errors?: Array<{ class: string; code: string; message: string }>;
    };
  }>;
  scores: Array<{
    sessionId: string;
    dimension: string;
    scoreBasisPoints: number;
    evaluator: string;
    uncertaintyBasisPoints: number;
    rationale: string;
    evidence: Array<Record<string, unknown>>;
  }>;
  events: Array<Record<string, unknown>>;
  baseline: {
    id: string;
    selected: boolean;
    reason: string;
    promotedAt: string;
  } | null;
  audit: Array<{
    id: string;
    action: string;
    actorRef: string | null;
    reason: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>;
}

// --- Copilot run lifecycle ----------------------------------------------------

export interface AiRunDto {
  id: string;
  employeeId: string;
  employeeName: string | null;
  prompt: string;
  context: Record<string, unknown> | null;
  contextSources: string[] | null;
  status:
    | "proposed"
    | "awaiting_confirmation"
    | "confirmed"
    | "executed"
    | "rejected"
    | "expired"
    | "failed";
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
  decision:
    | "allow"
    | "needs_confirmation"
    | "needs_second_approver"
    | "blocked";
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
  adminAccess: 'existing_account' | 'activation' | 'temporary_password';
}

export interface PetrosLearnerDiagnosticDto {
  institutionRef: string;
  studentRef: string;
  algorithmVersion: string;
  retention: {
    rawEvidence: string;
    derivedSummaries: string;
    transfer: string;
  };
  mastery: Array<{
    id: string;
    conceptId: string;
    topicId: string;
    masteryBasisPoints: number;
    recallBasisPoints: number;
    applicationBasisPoints: number;
    confidenceBasisPoints: number;
    uncertaintyBasisPoints: number;
    evidenceCount: number;
    evidenceSources: Record<string, number>;
    lastTouchedAt: string;
    nextReviewAt: string | null;
    algorithmVersion: string;
  }>;
  moveOutcomes: Array<{
    id: string;
    moveType: string;
    topicId: string;
    profileDimension: string;
    successes: number;
    failures: number;
    skips: number;
    sampleSize: number;
    effectivenessBasisPoints: number;
    confidenceBasisPoints: number;
    lastEvidenceAt: string;
  }>;
  preference: null | {
    pace: string;
    depth: string;
    skipCount: number;
    expandCount: number;
    readCount: number;
    responseCount: number;
    evidenceCount: number;
    confidenceBasisPoints: number;
    minimumEvidenceMet: boolean;
  };
  errors: Array<{
    id: string;
    category: string;
    topicId: string;
    count: number;
    contexts: string[];
    confidenceBasisPoints: number;
    evidenceEventIds: string[];
    lastEvidenceAt: string;
  }>;
  calibration: null | {
    buckets: Array<{ confidence: string; outcome: string; count: number }>;
    scoreBasisPoints: number;
    uncertaintyBasisPoints: number;
    evidenceCount: number;
  };
  evidence: Array<{
    id: string;
    source: string;
    sourceEventId: string;
    sourceRecordId: string | null;
    conceptId: string;
    topicId: string;
    kind: string;
    outcome: string;
    creditBasisPoints: number;
    errorCategory: string;
    occurredAt: string;
    algorithmVersion: string;
  }>;
  quarantine: Array<Record<string, unknown>>;
  jobs: Array<
    Record<string, unknown> & {
      id: string;
      status: string;
      processedEvents: number;
      totalEvents: number;
    }
  >;
  planSnapshots: Array<
    Record<string, unknown> & {
      id: string;
      decisionId: string;
      snapshot: Record<string, unknown>;
      causalFactors: string[];
    }
  >;
  boundedSnapshot: Record<string, unknown> & {
    neutral: boolean;
    stale: boolean;
    causalFactors: string[];
  };
  stale: boolean;
  lastUpdateAt: string | null;
}

export interface PetrosLearnerSourceSyncDto {
  scope: { institutionId: string; studentId: string };
  totals: {
    scanned: number;
    accepted: number;
    duplicates: number;
    quarantined: number;
    failed: number;
  };
}
