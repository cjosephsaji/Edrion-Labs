import type { PlanListItemDto } from '@edrion/api-client';

const CONTACT_METHOD_LABELS: Record<string, string> = {
  email: 'Email',
  phone: 'Phone',
  whatsapp: 'WhatsApp',
};

export function formatContactMethod(value?: string | null): string | undefined {
  if (!value) return undefined;
  return CONTACT_METHOD_LABELS[value] ?? value;
}

export function planNameByKey(plans: PlanListItemDto[]): Map<string, string> {
  return new Map(plans.map((p) => [p.key, p.name]));
}

export function formatPlanName(
  key: string | null | undefined,
  names: Map<string, string>,
): string | undefined {
  if (!key) return undefined;
  return names.get(key) ?? key;
}
