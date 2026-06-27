/**
 * Canonical enums for the platform. Used by schemas, the database layer, the API and the
 * frontend. Keep these in sync with the DB status columns (validated in migrations).
 */

export const InstitutionStatus = {
  Lead: 'lead',
  Onboarding: 'onboarding',
  Trial: 'trial',
  Active: 'active',
  PastDue: 'past_due',
  Restricted: 'restricted',
  Suspended: 'suspended',
  Cancelled: 'cancelled',
  Archived: 'archived',
} as const;
export type InstitutionStatus = (typeof InstitutionStatus)[keyof typeof InstitutionStatus];

export const OnboardingStatus = {
  NotStarted: 'not_started',
  InProgress: 'in_progress',
  AwaitingCustomer: 'awaiting_customer',
  Completed: 'completed',
} as const;
export type OnboardingStatus = (typeof OnboardingStatus)[keyof typeof OnboardingStatus];

export const InstitutionType = {
  School: 'school',
  College: 'college',
  University: 'university',
  TrainingCenter: 'training_center',
} as const;
export type InstitutionType = (typeof InstitutionType)[keyof typeof InstitutionType];

export const SupportTier = {
  Standard: 'standard',
  Priority: 'priority',
  Enterprise: 'enterprise',
} as const;
export type SupportTier = (typeof SupportTier)[keyof typeof SupportTier];

export const CampusBillingStatus = {
  Included: 'included',
  PaidAddon: 'paid_addon',
  Trial: 'trial',
  Suspended: 'suspended',
} as const;
export type CampusBillingStatus = (typeof CampusBillingStatus)[keyof typeof CampusBillingStatus];

export const AccountStatus = {
  Invited: 'invited',
  Active: 'active',
  Disabled: 'disabled',
  Locked: 'locked',
  PendingDeletion: 'pending_deletion',
} as const;
export type AccountStatus = (typeof AccountStatus)[keyof typeof AccountStatus];

export const SubscriptionStatus = {
  Trial: 'trial',
  Active: 'active',
  PastDue: 'past_due',
  Grace: 'grace',
  Paused: 'paused',
  Cancelled: 'cancelled',
  Expired: 'expired',
} as const;
export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

export const BillingCycle = { Monthly: 'monthly', Annual: 'annual' } as const;
export type BillingCycle = (typeof BillingCycle)[keyof typeof BillingCycle];

export const PlanStatus = {
  Draft: 'draft',
  Published: 'published',
  Archived: 'archived',
} as const;
export type PlanStatus = (typeof PlanStatus)[keyof typeof PlanStatus];

export const PlanAudience = { Institution: 'institution', Independent: 'independent' } as const;
export type PlanAudience = (typeof PlanAudience)[keyof typeof PlanAudience];

/** Who performed an action — drives audit `actor_type` and identity isolation. */
export const ActorType = {
  PlatformEmployee: 'platform_employee',
  InstitutionUser: 'institution_user',
  IndependentUser: 'independent_user',
  System: 'system',
  Ai: 'ai',
} as const;
export type ActorType = (typeof ActorType)[keyof typeof ActorType];

export const RiskLevel = {
  Low: 'low',
  Medium: 'medium',
  High: 'high',
  Critical: 'critical',
} as const;
export type RiskLevel = (typeof RiskLevel)[keyof typeof RiskLevel];

export const AuditResult = { Success: 'success', Failure: 'failure', Denied: 'denied' } as const;
export type AuditResult = (typeof AuditResult)[keyof typeof AuditResult];

/** Feature-resolution scopes, ordered least → most specific (see feature-flags). */
export const FeatureScope = {
  Global: 'global',
  Plan: 'plan',
  Institution: 'institution',
  Campus: 'campus',
  IndependentUser: 'independent_user',
  InstitutionUser: 'institution_user',
  EmployeeRole: 'employee_role',
  Cohort: 'cohort',
} as const;
export type FeatureScope = (typeof FeatureScope)[keyof typeof FeatureScope];

export const FeatureReleaseStage = {
  Internal: 'internal',
  Alpha: 'alpha',
  Beta: 'beta',
  GA: 'ga',
  Deprecated: 'deprecated',
} as const;
export type FeatureReleaseStage = (typeof FeatureReleaseStage)[keyof typeof FeatureReleaseStage];

/** Lifecycle of a feature definition. Anything but `active` resolves OFF for everyone. */
export const FeatureDefinitionStatus = {
  Active: 'active',
  Inactive: 'inactive',
  Archived: 'archived',
} as const;
export type FeatureDefinitionStatus =
  (typeof FeatureDefinitionStatus)[keyof typeof FeatureDefinitionStatus];

/** Rollout modifiers layered on top of the scope hierarchy. */
export const FeatureRolloutType = {
  Percentage: 'percentage',
  AllowList: 'allow_list',
  BlockList: 'block_list',
  Environment: 'environment',
  Schedule: 'schedule',
  KillSwitch: 'kill_switch',
} as const;
export type FeatureRolloutType = (typeof FeatureRolloutType)[keyof typeof FeatureRolloutType];

/** Which layer won during feature resolution — surfaced in the Effective-Value explainer. */
export const FeatureResolutionLayer = {
  KillSwitch: 'kill_switch',
  DefinitionInactive: 'definition_inactive',
  RolloutBlockList: 'rollout_block_list',
  RolloutAllowList: 'rollout_allow_list',
  RolloutPercentage: 'rollout_percentage',
  Assignment: 'assignment',
  Default: 'default',
} as const;
export type FeatureResolutionLayer =
  (typeof FeatureResolutionLayer)[keyof typeof FeatureResolutionLayer];

export const SupportCaseStatus = {
  Open: 'open',
  Pending: 'pending',
  Resolved: 'resolved',
  Closed: 'closed',
} as const;
export type SupportCaseStatus = (typeof SupportCaseStatus)[keyof typeof SupportCaseStatus];

export const SupportAccessSessionStatus = {
  Requested: 'requested',
  Approved: 'approved',
  Active: 'active',
  Ended: 'ended',
  Expired: 'expired',
} as const;
export type SupportAccessSessionStatus =
  (typeof SupportAccessSessionStatus)[keyof typeof SupportAccessSessionStatus];

/** AI action lifecycle — enforces "no mutation without confirmation". */
export const AiActionStatus = {
  Proposed: 'proposed',
  AwaitingConfirmation: 'awaiting_confirmation',
  Confirmed: 'confirmed',
  Executed: 'executed',
  Rejected: 'rejected',
  Expired: 'expired',
  Failed: 'failed',
} as const;
export type AiActionStatus = (typeof AiActionStatus)[keyof typeof AiActionStatus];

export const AiMode = {
  Disabled: 'disabled',
  ReadOnly: 'read_only',
  DraftOnly: 'draft_only',
  Full: 'full',
} as const;
export type AiMode = (typeof AiMode)[keyof typeof AiMode];

/**
 * Copilot capabilities, gated individually per policy. The first four are read-only (no state
 * change); `drafting` prepares content; the rest are state-changing and so can never run without
 * a human confirmation (docs/AI-GUARDRAILS.md).
 */
export const AiCapability = {
  Search: 'search',
  Analysis: 'analysis',
  Recommendations: 'recommendations',
  Report: 'report',
  Drafting: 'drafting',
  RecordCreate: 'record_create',
  RecordEdit: 'record_edit',
  Billing: 'billing',
  User: 'user',
  Permission: 'permission',
  InstitutionAccess: 'institution_access',
  Feature: 'feature',
  Communications: 'communications',
} as const;
export type AiCapability = (typeof AiCapability)[keyof typeof AiCapability];

/**
 * Guardrail outcome for a proposed AI action. Never a bare boolean — the evaluator returns the
 * deciding rule + reason (mirrors the feature-resolution Effective-Value model).
 */
export const AiGuardrailDecision = {
  /** Read-only / drafting capability — no state change, may proceed without confirmation. */
  Allow: 'allow',
  /** State-changing action — requires explicit human confirmation before execution. */
  NeedsConfirmation: 'needs_confirmation',
  /** High-impact action — requires a second approver in addition to confirmation. */
  NeedsSecondApprover: 'needs_second_approver',
  /** Disallowed outright (kill switch, disabled mode/capability, over a hard cap, rule block). */
  Blocked: 'blocked',
} as const;
export type AiGuardrailDecision = (typeof AiGuardrailDecision)[keyof typeof AiGuardrailDecision];

/** Which rule decided a guardrail outcome — surfaced in the explainer + audit. */
export const AiGuardrailLayer = {
  KillSwitch: 'kill_switch',
  ModeDisabled: 'mode_disabled',
  CapabilityDisabled: 'capability_disabled',
  ModeReadOnly: 'mode_read_only',
  ModeDraftOnly: 'mode_draft_only',
  ActionRuleBlock: 'action_rule_block',
  FinancialCap: 'financial_cap',
  AffectedUsersCap: 'affected_users_cap',
  ActionRuleSecondApprover: 'action_rule_second_approver',
  TwoPersonThreshold: 'two_person_threshold',
  CapabilitySecondApprover: 'capability_second_approver',
  RiskSecondApprover: 'risk_second_approver',
  ConfirmationRequired: 'confirmation_required',
  ReadOnlyAllowed: 'read_only_allowed',
} as const;
export type AiGuardrailLayer = (typeof AiGuardrailLayer)[keyof typeof AiGuardrailLayer];

/** Per-capability / per-action rule effect, applied on top of the resolved policy. */
export const AiActionRuleEffect = {
  Allow: 'allow',
  RequireConfirmation: 'require_confirmation',
  RequireSecondApprover: 'require_second_approver',
  Block: 'block',
} as const;
export type AiActionRuleEffect = (typeof AiActionRuleEffect)[keyof typeof AiActionRuleEffect];

/** Platform events a webhook endpoint may subscribe to. `webhook.test` fires on demand. */
export const WebhookEventType = {
  InstitutionActivated: 'institution.activated',
  InstitutionSuspended: 'institution.suspended',
  SubscriptionUpdated: 'subscription.updated',
  InvoicePaid: 'invoice.paid',
  SupportCaseCreated: 'support_case.created',
  WebhookTest: 'webhook.test',
} as const;
export type WebhookEventType = (typeof WebhookEventType)[keyof typeof WebhookEventType];

/** Outcome of a single webhook delivery attempt. Deliveries are append-only. */
export const DeliveryStatus = {
  Pending: 'pending',
  Delivered: 'delivered',
  Failed: 'failed',
} as const;
export type DeliveryStatus = (typeof DeliveryStatus)[keyof typeof DeliveryStatus];

export const PendingActionPriority = {
  Critical: 'critical',
  Today: 'today',
  Upcoming: 'upcoming',
  Informational: 'informational',
} as const;
export type PendingActionPriority =
  (typeof PendingActionPriority)[keyof typeof PendingActionPriority];

/** Supported display/billing currencies (ISO 4217). Extend as markets are added. */
export const Currency = {
  USD: 'USD',
  INR: 'INR',
  EUR: 'EUR',
  GBP: 'GBP',
  AED: 'AED',
} as const;
export type Currency = (typeof Currency)[keyof typeof Currency];
