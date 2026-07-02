/** Client-side mirror of the portal onboarding DTOs (GET /v1/portal/onboarding). API is authority. */

export interface OnboardingStep {
  key: string;
  label: string;
  /** Live count of records the admin has added for this step. */
  count: number;
  /** How many are needed to complete the step (currently 1). */
  required: number;
  done: boolean;
}

export interface OnboardingSummary {
  institution: {
    displayName: string;
    status: string;
    onboardingStatus: string;
    activatedAt: string | null;
    isComplete: boolean;
  };
  progress: { done: number; total: number; percent: number };
  steps: OnboardingStep[];
}
