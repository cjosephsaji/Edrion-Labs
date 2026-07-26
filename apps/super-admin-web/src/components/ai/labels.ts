import { AiCapability, AiMode } from '@edrion/shared-types';

/** Capabilities in display order. The first four are read-only (no state change). */
export const CAPABILITIES: { key: string; label: string; mutating: boolean }[] = [
  { key: AiCapability.Search, label: 'Search', mutating: false },
  { key: AiCapability.Analysis, label: 'Analysis', mutating: false },
  { key: AiCapability.Recommendations, label: 'Recommendations', mutating: false },
  { key: AiCapability.Report, label: 'Report', mutating: false },
  { key: AiCapability.Drafting, label: 'Drafting', mutating: false },
  { key: AiCapability.RecordCreate, label: 'Record create', mutating: true },
  { key: AiCapability.RecordEdit, label: 'Record edit', mutating: true },
  { key: AiCapability.Billing, label: 'Billing', mutating: true },
  { key: AiCapability.User, label: 'User', mutating: true },
  { key: AiCapability.Permission, label: 'Permission', mutating: true },
  { key: AiCapability.InstitutionAccess, label: 'Institution access', mutating: true },
  { key: AiCapability.Feature, label: 'Feature', mutating: true },
  { key: AiCapability.Communications, label: 'Communications', mutating: true },
];

export const MODES: { key: string; label: string; hint: string }[] = [
  { key: AiMode.Disabled, label: 'Disabled', hint: 'Copilot off — every action blocked' },
  { key: AiMode.ReadOnly, label: 'Read only', hint: 'Search & analysis only; no drafts or changes' },
  { key: AiMode.DraftOnly, label: 'Draft only', hint: 'May draft, but cannot execute state changes' },
  { key: AiMode.Full, label: 'Full', hint: 'May prepare changes — each still needs confirmation' },
];

export const CAPABILITY_LABEL: Record<string, string> = Object.fromEntries(
  CAPABILITIES.map((c) => [c.key, c.label]),
);

export const DECISION_META: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  allow: { label: 'ALLOW', tone: 'success' },
  needs_confirmation: { label: 'NEEDS CONFIRMATION', tone: 'warning' },
  needs_second_approver: { label: 'SECOND APPROVER', tone: 'warning' },
  blocked: { label: 'BLOCKED', tone: 'danger' },
};

export const GUARDRAIL_LAYER_LABEL: Record<string, string> = {
  kill_switch: 'Kill switch',
  mode_disabled: 'Mode · disabled',
  capability_disabled: 'Capability disabled',
  mode_read_only: 'Mode · read-only',
  mode_draft_only: 'Mode · draft-only',
  action_rule_block: 'Action rule · block',
  financial_cap: 'Financial cap',
  affected_users_cap: 'Affected-users cap',
  action_rule_second_approver: 'Action rule · second approver',
  two_person_threshold: 'Two-person threshold',
  capability_second_approver: 'Capability · second approver',
  risk_second_approver: 'Risk · second approver',
  confirmation_required: 'Confirmation required',
  read_only_allowed: 'Read-only allowed',
};
