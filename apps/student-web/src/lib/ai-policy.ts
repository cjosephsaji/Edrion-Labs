type AiPolicy = 'off' | 'hints_only' | 'full';

export function aiPolicyPill(policy: AiPolicy): { label: string; tone: 'neutral' | 'info' | 'warning' } {
  switch (policy) {
    case 'full':
      return { label: 'Petros help: Full', tone: 'info' };
    case 'hints_only':
      return { label: 'Petros help: Concept-only', tone: 'warning' };
    case 'off':
      return { label: 'Petros help: Off', tone: 'neutral' };
  }
}
