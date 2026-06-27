import { sql } from 'drizzle-orm';
import { pgEnum, timestamp, uuid } from 'drizzle-orm/pg-core';
import {
  AccountStatus,
  AiActionRuleEffect,
  AiActionStatus,
  AiCapability,
  AiGuardrailDecision,
  AiMode,
  BillingCycle,
  CampusBillingStatus,
  Currency,
  DeliveryStatus,
  FeatureDefinitionStatus,
  FeatureReleaseStage,
  FeatureRolloutType,
  FeatureScope,
  InstitutionStatus,
  InstitutionType,
  OnboardingStatus,
  PlanAudience,
  PlanStatus,
  RiskLevel,
  SubscriptionStatus,
  SupportAccessSessionStatus,
  SupportCaseStatus,
  SupportTier,
  ActorType,
  AuditResult,
} from '@edrion/shared-types';

/** Build a pg enum from one of our const enum records, keeping values in sync. */
function values<T extends Record<string, string>>(obj: T): [string, ...string[]] {
  return Object.values(obj) as [string, ...string[]];
}

export const institutionStatusEnum = pgEnum('institution_status', values(InstitutionStatus));
export const institutionTypeEnum = pgEnum('institution_type', values(InstitutionType));
export const onboardingStatusEnum = pgEnum('onboarding_status', values(OnboardingStatus));
export const supportTierEnum = pgEnum('support_tier', values(SupportTier));
export const campusBillingStatusEnum = pgEnum('campus_billing_status', values(CampusBillingStatus));
export const accountStatusEnum = pgEnum('account_status', values(AccountStatus));
export const subscriptionStatusEnum = pgEnum('subscription_status', values(SubscriptionStatus));
export const billingCycleEnum = pgEnum('billing_cycle', values(BillingCycle));
export const planStatusEnum = pgEnum('plan_status', values(PlanStatus));
export const planAudienceEnum = pgEnum('plan_audience', values(PlanAudience));
export const currencyEnum = pgEnum('currency', values(Currency));
export const actorTypeEnum = pgEnum('actor_type', values(ActorType));
export const riskLevelEnum = pgEnum('risk_level', values(RiskLevel));
export const auditResultEnum = pgEnum('audit_result', values(AuditResult));
export const supportCaseStatusEnum = pgEnum('support_case_status', values(SupportCaseStatus));
export const supportAccessSessionStatusEnum = pgEnum(
  'support_access_session_status',
  values(SupportAccessSessionStatus),
);
export const aiActionStatusEnum = pgEnum('ai_action_status', values(AiActionStatus));
export const aiModeEnum = pgEnum('ai_mode', values(AiMode));
export const aiCapabilityEnum = pgEnum('ai_capability', values(AiCapability));
export const aiGuardrailDecisionEnum = pgEnum('ai_guardrail_decision', values(AiGuardrailDecision));
export const aiActionRuleEffectEnum = pgEnum('ai_action_rule_effect', values(AiActionRuleEffect));
export const featureScopeEnum = pgEnum('feature_scope', values(FeatureScope));
export const featureReleaseStageEnum = pgEnum('feature_release_stage', values(FeatureReleaseStage));
export const featureDefinitionStatusEnum = pgEnum(
  'feature_definition_status',
  values(FeatureDefinitionStatus),
);
export const featureRolloutTypeEnum = pgEnum('feature_rollout_type', values(FeatureRolloutType));
export const deliveryStatusEnum = pgEnum('delivery_status', values(DeliveryStatus));

/** UUID primary key with DB-side default. */
export const primaryId = () => uuid('id').primaryKey().defaultRandom();

/** created_at / updated_at, UTC. */
export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** created_by / updated_by employee references (nullable for system actions). */
export const actorColumns = {
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
};

export const nowSql = sql`now()`;
