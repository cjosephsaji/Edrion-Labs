'use client';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { qs } from './client';
import { useApiClient } from './provider';
import type {
  AccessPreviewDto,
  CampusChargeBreakdownDto,
  CampusList,
  CreateCampusResult,
  CurrentEmployee,
  InstitutionDto,
  InstitutionList,
  InstitutionStatusSummary,
  InstitutionUserDetailDto,
  InstitutionUserList,
  InstitutionUserStatusSummary,
  IndependentUserDto,
  IndependentUserList,
  EmployeeDto,
  EmployeeList,
  EmployeeDetailDto,
  PlatformRoleList,
  PermissionCatalogue,
  WebhookEndpointDto,
  WebhookEndpointList,
  WebhookEndpointDetailDto,
  TestDeliveryResultDto,
  SupportCaseDto,
  SupportCaseList,
  SupportCaseDetailDto,
  SupportMessageDto,
  BillingSummaryDto,
  CreditList,
  DiscountList,
  EntitlementsDto,
  InvoiceDetailDto,
  InvoiceList,
  PaymentList,
  PlanChangeProrationDto,
  PlanDetailDto,
  PlanList,
  PlanStatusSummary,
  PlanVersionPricingPayload,
  SubscriptionDetailDto,
  SubscriptionList,
  SubscriptionStatusSummary,
  SupportAccessSessionDto,
  SupportAccessSessionList,
  FeatureList,
  FeatureStatusSummary,
  FeatureDetailDto,
  FeatureDefinitionDto,
  FeatureAssignmentDto,
  FeatureRolloutDto,
  FeatureResolutionDto,
  DashboardAggregatesDto,
  PendingActionsDto,
  AuditEventDto,
  AuditEventPage,
  ActivityEventPage,
  SystemHealthDto,
  AiGovernanceOverviewDto,
  AiPolicyList,
  AiPolicyDto,
  AiActionRuleDto,
  GuardrailResultDto,
  EffectiveAiPolicyDto,
  AiRunDetailDto,
  AiRunPage,
  RegistrationList,
  RegistrationStatusSummary,
  RegistrationDetailDto,
  RegistrationRequestDto,
  RegistrationApprovalResultDto,
} from './types';

/** A fresh idempotency key for a financial mutation. */
function newIdemKey(): string {
  return (globalThis.crypto?.randomUUID?.() ?? `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

export const queryKeys = {
  me: ['me'] as const,
  institutions: (params: Record<string, unknown>) => ['institutions', params] as const,
  institutionsSummary: ['institutions', 'summary'] as const,
  institution: (id: string) => ['institutions', id] as const,
  supportSessions: (params: Record<string, unknown>) => ['support-sessions', params] as const,
  supportSession: (id: string) => ['support-sessions', id] as const,
  institutionUsers: (params: Record<string, unknown>) => ['institution-users', params] as const,
  institutionUsersSummary: (institutionId?: string) =>
    ['institution-users', 'summary', institutionId ?? 'all'] as const,
  institutionUser: (id: string) => ['institution-users', id] as const,
  independentUsers: (params: Record<string, unknown>) => ['independent-users', params] as const,
  independentUser: (id: string) => ['independent-users', id] as const,
  employees: (params: Record<string, unknown>) => ['employees', params] as const,
  employee: (id: string) => ['employees', id] as const,
  platformRoles: ['platform-roles'] as const,
  permissionCatalogue: ['platform-roles', 'permissions'] as const,
  webhookEndpoints: (params: Record<string, unknown>) => ['integrations', params] as const,
  webhookEndpoint: (id: string) => ['integrations', id] as const,
  supportCases: (params: Record<string, unknown>) => ['support-cases', params] as const,
  supportCase: (id: string) => ['support-cases', id] as const,
  plans: (params: Record<string, unknown>) => ['plans', params] as const,
  plansSummary: ['plans', 'summary'] as const,
  plan: (id: string) => ['plans', id] as const,
  subscriptions: (params: Record<string, unknown>) => ['subscriptions', params] as const,
  subscriptionsSummary: (institutionId?: string) =>
    ['subscriptions', 'summary', institutionId ?? 'all'] as const,
  subscription: (id: string) => ['subscriptions', id] as const,
  subscriptionByInstitution: (institutionId: string) =>
    ['subscriptions', 'by-institution', institutionId] as const,
  invoices: (params: Record<string, unknown>) => ['invoices', params] as const,
  invoice: (id: string) => ['invoices', id] as const,
  payments: (params: Record<string, unknown>) => ['payments', params] as const,
  credits: (params: Record<string, unknown>) => ['credits', params] as const,
  discounts: (params: Record<string, unknown>) => ['discounts', params] as const,
  billingSummary: (institutionId: string) => ['billing', 'summary', institutionId] as const,
  entitlements: (institutionId: string) => ['entitlements', institutionId] as const,
  features: (params: Record<string, unknown>) => ['features', params] as const,
  featuresSummary: ['features', 'summary'] as const,
  feature: (id: string) => ['features', id] as const,
  featureResolve: (id: string, ctx: Record<string, unknown>) =>
    ['features', id, 'resolve', ctx] as const,
  registrationRequests: (params: Record<string, unknown>) => ['registration-requests', params] as const,
  registrationSummary: ['registration-requests', 'summary'] as const,
  registrationRequest: (id: string) => ['registration-requests', id] as const,
};

export function useCurrentEmployee(options?: Partial<UseQueryOptions<CurrentEmployee>>) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => client.get<CurrentEmployee>('/auth/me'),
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

/** Establish a session (sets the HTTP-only cookie server-side). */
export function useLogin() {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { accessToken?: string; email?: string }) =>
      client.post<{ authenticated: true }>('/auth/login', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

/**
 * Strong re-authentication — refreshes the recent-auth window so a sensitive action that hit
 * RECENT_AUTH_REQUIRED can be retried. Invalidates `me` so any recent-auth UI updates.
 */
export function useReauth() {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { accessToken?: string; confirm?: true }) =>
      client.post<{ reauthenticated: true }>('/auth/reauth', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

/** Revoke the current session + clear the cookie, then drop all cached data. */
export function useLogout() {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => client.post<{ loggedOut: true }>('/auth/logout'),
    onSuccess: () => {
      qc.clear();
    },
  });
}

export interface IndependentUsersFilter {
  search?: string;
  status?: string;
  country?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export function useIndependentUsers(filter: IndependentUsersFilter) {
  const client = useApiClient();
  const params = filter as Record<string, unknown>;
  return useQuery({
    queryKey: queryKeys.independentUsers(params),
    queryFn: () => client.get<IndependentUserList>(`/independent-users${qs(params)}`),
    placeholderData: (prev) => prev,
  });
}

export function useIndependentUser(id: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.independentUser(id),
    queryFn: () => client.get<IndependentUserDto>(`/independent-users/${id}`),
    enabled: Boolean(id),
  });
}

export type IndependentUserAction = 'disable' | 'restore';

export function useIndependentUserStatusAction(id: string) {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { action: IndependentUserAction; reason: string; version: number }) =>
      client.post<IndependentUserDto>(`/independent-users/${id}/${vars.action}`, {
        reason: vars.reason,
        version: vars.version,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['independent-users'] });
    },
  });
}

// --- Employees ---------------------------------------------------------------

export interface EmployeesFilter {
  search?: string;
  status?: string;
  roleId?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export function useEmployees(filter: EmployeesFilter) {
  const client = useApiClient();
  const params = filter as Record<string, unknown>;
  return useQuery({
    queryKey: queryKeys.employees(params),
    queryFn: () => client.get<EmployeeList>(`/employees${qs(params)}`),
    placeholderData: (prev) => prev,
  });
}

export function useEmployee(id: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.employee(id),
    queryFn: () => client.get<EmployeeDetailDto>(`/employees/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateEmployee() {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; fullName: string; title?: string }) =>
      client.post<EmployeeDto>('/employees', input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['employees'] }),
  });
}

export function useUpdateEmployee(id: string) {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { fullName?: string; title?: string | null; version: number }) =>
      client.patch<EmployeeDto>(`/employees/${id}`, input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['employees'] }),
  });
}

export type EmployeeStatusAction = 'disable' | 'restore';

export function useEmployeeStatusAction(id: string) {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { action: EmployeeStatusAction; reason: string; version: number }) =>
      client.post<EmployeeDto>(`/employees/${id}/${vars.action}`, {
        reason: vars.reason,
        version: vars.version,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['employees'] }),
  });
}

export function useAssignRoles(id: string) {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { roleIds: string[]; reason: string }) =>
      client.post<{ roles: PlatformRoleList['items'] }>(`/employees/${id}/roles`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['employees'] });
      void qc.invalidateQueries({ queryKey: queryKeys.platformRoles });
    },
  });
}

// --- Platform roles (read-only) ----------------------------------------------

export function usePlatformRoles() {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.platformRoles,
    queryFn: () => client.get<PlatformRoleList>('/platform-roles'),
  });
}

export function usePermissionCatalogue() {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.permissionCatalogue,
    queryFn: () => client.get<PermissionCatalogue>('/platform-roles/permissions'),
    staleTime: 10 * 60 * 1000,
  });
}

// --- Integrations / webhooks -------------------------------------------------

export interface WebhookEndpointsFilter {
  search?: string;
  active?: boolean;
  institutionId?: string;
  page?: number;
  pageSize?: number;
}

export function useWebhookEndpoints(filter: WebhookEndpointsFilter) {
  const client = useApiClient();
  const params = filter as Record<string, unknown>;
  return useQuery({
    queryKey: queryKeys.webhookEndpoints(params),
    queryFn: () => client.get<WebhookEndpointList>(`/integrations${qs(params)}`),
    placeholderData: (prev) => prev,
  });
}

export function useWebhookEndpoint(id: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.webhookEndpoint(id),
    queryFn: () => client.get<WebhookEndpointDetailDto>(`/integrations/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateEndpoint() {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { url: string; events: string[]; institutionId?: string; description?: string }) =>
      client.post<WebhookEndpointDto>('/integrations', input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['integrations'] }),
  });
}

export function useUpdateEndpoint(id: string) {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      url?: string;
      events?: string[];
      active?: boolean;
      description?: string | null;
      version: number;
    }) => client.patch<WebhookEndpointDto>(`/integrations/${id}`, input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['integrations'] }),
  });
}

export function useRotateSecret(id: string) {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { reason: string; version: number }) =>
      client.post<WebhookEndpointDto>(`/integrations/${id}/rotate-secret`, input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['integrations'] }),
  });
}

export function useTestDelivery(id: string) {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { eventType?: string }) =>
      client.post<TestDeliveryResultDto>(`/integrations/${id}/test`, input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.webhookEndpoint(id) }),
  });
}

export interface SupportCasesFilter {
  search?: string;
  status?: string;
  priority?: string;
  institutionId?: string;
  assignedEmployeeId?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export function useSupportCases(filter: SupportCasesFilter) {
  const client = useApiClient();
  const params = filter as Record<string, unknown>;
  return useQuery({
    queryKey: queryKeys.supportCases(params),
    queryFn: () => client.get<SupportCaseList>(`/support-cases${qs(params)}`),
    placeholderData: (prev) => prev,
  });
}

export function useSupportCase(id: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.supportCase(id),
    queryFn: () => client.get<SupportCaseDetailDto>(`/support-cases/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateSupportCase() {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => client.post<SupportCaseDto>('/support-cases', input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['support-cases'] }),
  });
}

export function useAddSupportMessage(id: string) {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: string; internal: boolean }) =>
      client.post<SupportMessageDto>(`/support-cases/${id}/messages`, input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.supportCase(id) }),
  });
}

export function useChangeSupportCaseStatus(id: string) {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { status: string; resolution?: string; reason: string }) =>
      client.post<SupportCaseDto>(`/support-cases/${id}/status`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['support-cases'] });
    },
  });
}

export interface InstitutionsFilter {
  search?: string;
  status?: string;
  type?: string;
  country?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export function useInstitutions(filter: InstitutionsFilter) {
  const client = useApiClient();
  const params = filter as Record<string, unknown>;
  return useQuery({
    queryKey: queryKeys.institutions(params),
    queryFn: () => client.get<InstitutionList>(`/institutions${qs(params)}`),
    placeholderData: (prev) => prev, // keep previous page while fetching the next
  });
}

export function useInstitutionsSummary() {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.institutionsSummary,
    queryFn: () => client.get<InstitutionStatusSummary>('/institutions/summary'),
    staleTime: 60 * 1000,
  });
}

export function useInstitution(id: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.institution(id),
    queryFn: () => client.get<InstitutionDto>(`/institutions/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateInstitution() {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      client.post<InstitutionDto>('/institutions', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['institutions'] });
    },
  });
}

export type InstitutionAction = 'activate' | 'restrict' | 'suspend' | 'archive';

export function useInstitutionStatusAction(id: string) {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { action: InstitutionAction; reason: string; caseRef?: string; version: number }) =>
      client.post<InstitutionDto>(`/institutions/${id}/${vars.action}`, {
        reason: vars.reason,
        caseRef: vars.caseRef,
        version: vars.version,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['institutions'] });
    },
  });
}

export interface CampusesFilter {
  institutionId?: string;
  billingStatus?: string;
  active?: boolean;
  page?: number;
  pageSize?: number;
}

export function useCampuses(filter: CampusesFilter) {
  const client = useApiClient();
  const params = filter as Record<string, unknown>;
  return useQuery({
    queryKey: ['campuses', params] as const,
    queryFn: () => client.get<CampusList>(`/campuses${qs(params)}`),
    enabled: filter.institutionId === undefined || Boolean(filter.institutionId),
  });
}

export function useCampusChargePreview() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (input: { institutionId: string; effectiveDate?: string; forcePaidAddon?: boolean; customDiscountBps?: number }) =>
      client.post<CampusChargeBreakdownDto>('/campuses/charge-preview', input),
  });
}

export interface CreateCampusVars {
  institutionId: string;
  name: string;
  // `code` is system-generated server-side (immutable) — not part of the create payload.
  timezoneOverride?: string;
  studentCapacity?: number;
  openingDate?: string;
  effectiveBillingDate?: string;
  forcePaidAddon?: boolean;
  customDiscountBps?: number;
}

export function useCreateCampus() {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCampusVars) => client.post<CreateCampusResult>('/campuses', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['campuses'] });
    },
  });
}

// --- Support access ----------------------------------------------------------

export interface SupportSessionsFilter {
  institutionId?: string;
  employeeId?: string;
  status?: string;
  activeOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export function useSupportSessions(filter: SupportSessionsFilter = {}) {
  const client = useApiClient();
  const params = filter as Record<string, unknown>;
  return useQuery({
    queryKey: queryKeys.supportSessions(params),
    queryFn: () => client.get<SupportAccessSessionList>(`/support-access${qs(params)}`),
    placeholderData: (prev) => prev,
  });
}

export function useSupportSession(id: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.supportSession(id),
    queryFn: () => client.get<SupportAccessSessionDto>(`/support-access/${id}`),
    enabled: Boolean(id),
  });
}

export interface StartSupportSessionVars {
  institutionId: string;
  accessLevel?: string;
  reason: string;
  caseRef?: string;
  campusId?: string;
  durationMinutes?: number;
}

export function useStartSupportSession() {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: StartSupportSessionVars) =>
      client.post<SupportAccessSessionDto>('/support-access/start', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['support-sessions'] });
    },
  });
}

export function useExtendSupportSession(id: string) {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { addMinutes: number; reason: string }) =>
      client.post<SupportAccessSessionDto>(`/support-access/${id}/extend`, vars),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['support-sessions'] });
    },
  });
}

export function useEndSupportSession() {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; reason?: string }) =>
      client.post<SupportAccessSessionDto>(`/support-access/${vars.id}/end`, { reason: vars.reason }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['support-sessions'] });
    },
  });
}

/** Fire-and-forget "portal opened" marker, used by the support banner on mount. */
export function useMarkPortalEntered() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (id: string) =>
      client.post<SupportAccessSessionDto>(`/support-access/${id}/portal-entered`),
  });
}

// --- Institution users -------------------------------------------------------

export interface InstitutionUsersFilter {
  search?: string;
  institutionId?: string;
  campusId?: string;
  roleKey?: string;
  status?: string;
  invitation?: 'pending' | 'accepted';
  lastActivity?: 'active_7d' | 'active_30d' | 'inactive_30d' | 'never';
  security?: 'mfa_missing' | 'mfa_required' | 'locked' | 'password_reset' | 'disabled';
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export function useInstitutionUsers(filter: InstitutionUsersFilter) {
  const client = useApiClient();
  const params = filter as Record<string, unknown>;
  return useQuery({
    queryKey: queryKeys.institutionUsers(params),
    queryFn: () => client.get<InstitutionUserList>(`/institution-users${qs(params)}`),
    placeholderData: (prev) => prev,
  });
}

export function useInstitutionUsersSummary(institutionId?: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.institutionUsersSummary(institutionId),
    queryFn: () =>
      client.get<InstitutionUserStatusSummary>(
        `/institution-users/summary${qs({ institutionId })}`,
      ),
    staleTime: 60 * 1000,
  });
}

export function useInstitutionUser(id: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.institutionUser(id),
    queryFn: () => client.get<InstitutionUserDetailDto>(`/institution-users/${id}`),
    enabled: Boolean(id),
  });
}

export interface InviteInstitutionUserVars {
  institutionId: string;
  email: string;
  fullName: string;
  phone?: string;
  roleKeys: string[];
  campusAccess?: { campusId: string; accessLevel: string }[];
  message?: string;
}

export function useInviteInstitutionUser() {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InviteInstitutionUserVars) =>
      client.post<InstitutionUserDetailDto>('/institution-users', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['institution-users'] });
    },
  });
}

export function useUpdateInstitutionUser(id: string) {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { fullName?: string; phone?: string; version: number }) =>
      client.patch<InstitutionUserDetailDto>(`/institution-users/${id}`, vars),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['institution-users'] });
    },
  });
}

/**
 * Generic POST action against an institution user (change-role, change-campus-access,
 * permission-overrides, disable, enable, unlock, require-mfa, force-password-reset,
 * revoke-sessions, resend-invite, remove-permission-override). Returns the refreshed detail.
 */
export function useInstitutionUserAction(id: string) {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { action: string; body?: Record<string, unknown> }) =>
      client.post<InstitutionUserDetailDto>(`/institution-users/${id}/${vars.action}`, vars.body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['institution-users'] });
    },
  });
}

/** Effective-access preview for a proposed change — read-only, never invalidates caches. */
export function usePreviewInstitutionUserAccess(id: string) {
  const client = useApiClient();
  return useMutation({
    mutationFn: (change: Record<string, unknown>) =>
      client.post<AccessPreviewDto>(`/institution-users/${id}/preview-access`, change),
  });
}

// --- Plans -------------------------------------------------------------------

export interface PlansFilter {
  search?: string;
  status?: string;
  audience?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export function usePlans(filter: PlansFilter) {
  const client = useApiClient();
  const params = filter as Record<string, unknown>;
  return useQuery({
    queryKey: queryKeys.plans(params),
    queryFn: () => client.get<PlanList>(`/plans${qs(params)}`),
    placeholderData: (prev) => prev,
  });
}

export function usePlansSummary() {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.plansSummary,
    queryFn: () => client.get<PlanStatusSummary>('/plans/summary'),
    staleTime: 60 * 1000,
  });
}

export function usePlan(id: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.plan(id),
    queryFn: () => client.get<PlanDetailDto>(`/plans/${id}`),
    enabled: Boolean(id),
  });
}

export interface CreatePlanDraftVars {
  key: string;
  name: string;
  description?: string;
  audience?: string;
  pricing: PlanVersionPricingPayload;
}

export function useCreatePlanDraft() {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePlanDraftVars) => client.post<PlanDetailDto>('/plans', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['plans'] });
    },
  });
}

export function useCreatePlanVersion(id: string) {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { pricing: PlanVersionPricingPayload; note?: string }) =>
      client.post<PlanDetailDto>(`/plans/${id}/versions`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.plan(id) });
      void qc.invalidateQueries({ queryKey: ['plans'] });
    },
  });
}

export function usePublishPlanVersion(id: string) {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { versionId: string; reason: string }) =>
      client.post<PlanDetailDto>(`/plans/${id}/versions/${vars.versionId}/publish`, { reason: vars.reason }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.plan(id) });
      void qc.invalidateQueries({ queryKey: ['plans'] });
    },
  });
}

export function useArchivePlan(id: string) {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { reason: string; version: number }) =>
      client.post<PlanDetailDto>(`/plans/${id}/archive`, vars),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.plan(id) });
      void qc.invalidateQueries({ queryKey: ['plans'] });
    },
  });
}

// --- Subscriptions -----------------------------------------------------------

export interface SubscriptionsFilter {
  search?: string;
  institutionId?: string;
  status?: string;
  billingCycle?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export function useSubscriptions(filter: SubscriptionsFilter) {
  const client = useApiClient();
  const params = filter as Record<string, unknown>;
  return useQuery({
    queryKey: queryKeys.subscriptions(params),
    queryFn: () => client.get<SubscriptionList>(`/subscriptions${qs(params)}`),
    placeholderData: (prev) => prev,
  });
}

export function useSubscriptionsSummary(institutionId?: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.subscriptionsSummary(institutionId),
    queryFn: () =>
      client.get<SubscriptionStatusSummary>(`/subscriptions/summary${qs({ institutionId })}`),
    staleTime: 60 * 1000,
  });
}

export function useSubscription(id: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.subscription(id),
    queryFn: () => client.get<SubscriptionDetailDto>(`/subscriptions/${id}`),
    enabled: Boolean(id),
  });
}

/** The institution's latest subscription — drives the institution-detail Subscription tab. */
export function useSubscriptionByInstitution(institutionId: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.subscriptionByInstitution(institutionId),
    queryFn: () =>
      client.get<SubscriptionDetailDto | null>(
        `/subscriptions/by-institution${qs({ institutionId })}`,
      ),
    enabled: Boolean(institutionId),
  });
}

/** Read-only proration preview for a plan or cycle change, shown before commit. */
export function useSubscriptionPreview(id: string, kind: 'plan-change' | 'cycle-change') {
  const client = useApiClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      client.post<PlanChangeProrationDto>(`/subscriptions/${id}/${kind}-preview`, body),
  });
}

/**
 * Generic POST action against a subscription (change-plan, schedule-plan-change, change-cycle,
 * extend-trial, add-addon, remove-addon, override-pricing, discount, credit, usage-limits,
 * overage, grace, pause, resume, cancel). Returns the refreshed detail and invalidates caches.
 */
export function useSubscriptionAction(id: string) {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { action: string; body: Record<string, unknown> }) =>
      client.post<SubscriptionDetailDto>(`/subscriptions/${id}/${vars.action}`, vars.body),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ['subscriptions'] });
      if (data?.institutionId) {
        void qc.invalidateQueries({ queryKey: queryKeys.subscriptionByInstitution(data.institutionId) });
      }
    },
  });
}

// --- Billing -----------------------------------------------------------------

export interface InvoicesFilter {
  institutionId?: string;
  subscriptionId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export function useInvoices(filter: InvoicesFilter) {
  const client = useApiClient();
  const params = filter as Record<string, unknown>;
  return useQuery({
    queryKey: queryKeys.invoices(params),
    queryFn: () => client.get<InvoiceList>(`/billing/invoices${qs(params)}`),
    placeholderData: (prev) => prev,
  });
}

export function useInvoice(id: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.invoice(id),
    queryFn: () => client.get<InvoiceDetailDto>(`/billing/invoices/${id}`),
    enabled: Boolean(id),
  });
}

export function useBillingSummary(institutionId: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.billingSummary(institutionId),
    queryFn: () => client.get<BillingSummaryDto>(`/billing/summary${qs({ institutionId })}`),
    enabled: Boolean(institutionId),
  });
}

function invalidateBilling(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['invoices'] });
  void qc.invalidateQueries({ queryKey: ['payments'] });
  void qc.invalidateQueries({ queryKey: ['credits'] });
  void qc.invalidateQueries({ queryKey: ['billing'] });
}

/** Create a draft invoice from a subscription. Sends an Idempotency-Key for replay safety. */
export function useCreateInvoice() {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      client.post<InvoiceDetailDto>('/billing/invoices', input, { 'idempotency-key': newIdemKey() }),
    onSuccess: () => invalidateBilling(qc),
  });
}

/** Generic invoice action: finalize, void, dunning. */
export function useInvoiceAction(id: string) {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { action: 'finalize' | 'void' | 'dunning'; body: Record<string, unknown> }) =>
      client.post<InvoiceDetailDto>(`/billing/invoices/${id}/${vars.action}`, vars.body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.invoice(id) });
      invalidateBilling(qc);
    },
  });
}

export function usePayments(filter: { institutionId?: string; invoiceId?: string; status?: string; page?: number; pageSize?: number }) {
  const client = useApiClient();
  const params = filter as Record<string, unknown>;
  return useQuery({
    queryKey: queryKeys.payments(params),
    queryFn: () => client.get<PaymentList>(`/billing/payments${qs(params)}`),
    placeholderData: (prev) => prev,
  });
}

export function useRecordPayment() {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      client.post('/billing/payments', input, { 'idempotency-key': newIdemKey() }),
    onSuccess: () => invalidateBilling(qc),
  });
}

export function useRetryPayment(id: string) {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => client.post(`/billing/payments/${id}/retry`, body),
    onSuccess: () => invalidateBilling(qc),
  });
}

export function useCreateRefund() {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      client.post('/billing/refunds', input, { 'idempotency-key': newIdemKey() }),
    onSuccess: () => invalidateBilling(qc),
  });
}

export function useCredits(filter: { institutionId?: string; page?: number; pageSize?: number }) {
  const client = useApiClient();
  const params = filter as Record<string, unknown>;
  return useQuery({
    queryKey: queryKeys.credits(params),
    queryFn: () => client.get<CreditList>(`/billing/credits${qs(params)}`),
    placeholderData: (prev) => prev,
  });
}

export function useIssueCredit() {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      client.post('/billing/credits', input, { 'idempotency-key': newIdemKey() }),
    onSuccess: () => invalidateBilling(qc),
  });
}

export function useDiscounts(filter: { institutionId?: string; page?: number; pageSize?: number }) {
  const client = useApiClient();
  const params = filter as Record<string, unknown>;
  return useQuery({
    queryKey: queryKeys.discounts(params),
    queryFn: () => client.get<DiscountList>(`/billing/discounts${qs(params)}`),
    placeholderData: (prev) => prev,
  });
}

export function useCreateDiscount() {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => client.post('/billing/discounts', input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['discounts'] }),
  });
}

export function useEntitlements(institutionId: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.entitlements(institutionId),
    queryFn: () => client.get<EntitlementsDto>(`/entitlements${qs({ institutionId })}`),
    enabled: Boolean(institutionId),
  });
}

// --- Feature controls --------------------------------------------------------

export interface FeaturesFilter {
  search?: string;
  module?: string;
  status?: string;
  releaseStage?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export function useFeatures(filter: FeaturesFilter) {
  const client = useApiClient();
  const params = filter as Record<string, unknown>;
  return useQuery({
    queryKey: queryKeys.features(params),
    queryFn: () => client.get<FeatureList>(`/features${qs(params)}`),
    placeholderData: (prev) => prev,
  });
}

export function useFeaturesSummary() {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.featuresSummary,
    queryFn: () => client.get<FeatureStatusSummary>('/features/summary'),
    staleTime: 60 * 1000,
  });
}

export function useFeature(id: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.feature(id),
    queryFn: () => client.get<FeatureDetailDto>(`/features/${id}`),
    enabled: Boolean(id),
  });
}

/** Effective-Value preview against an explicit resolution context. */
export interface ResolveFeatureContext {
  planId?: string;
  institutionId?: string;
  campusId?: string;
  institutionUserId?: string;
  independentUserId?: string;
  employeeRoleKeys?: string;
  environment?: string;
  subjectId?: string;
  at?: string;
}

export function useResolveFeature(id: string, ctx: ResolveFeatureContext, enabled = true) {
  const client = useApiClient();
  const params = ctx as Record<string, unknown>;
  return useQuery({
    queryKey: queryKeys.featureResolve(id, params),
    queryFn: () => client.get<FeatureResolutionDto>(`/features/${id}/resolve${qs(params)}`),
    enabled: Boolean(id) && enabled,
  });
}

export function useCreateFeature() {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      client.post<FeatureDefinitionDto>('/features', input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['features'] }),
  });
}

export function useUpdateFeature(id: string) {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      client.patch<FeatureDefinitionDto>(`/features/${id}`, input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['features'] }),
  });
}

export function useSetFeatureStatus(id: string) {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { status: string; version: number; reason: string }) =>
      client.post<FeatureDefinitionDto>(`/features/${id}/status`, vars),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['features'] }),
  });
}

export interface UpsertFeatureAssignmentVars {
  scope: string;
  scopeId?: string | null;
  value: boolean;
  enabled?: boolean;
  activatesAt?: string | null;
  expiresAt?: string | null;
  reason: string;
}

export function useUpsertFeatureAssignment(id: string) {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertFeatureAssignmentVars) =>
      client.request<FeatureAssignmentDto>(`/features/${id}/assignments`, {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['features', id] }),
  });
}

export function useRemoveFeatureAssignment(id: string) {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { assignmentId: string; reason: string }) =>
      client.request<void>(`/features/${id}/assignments/${vars.assignmentId}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason: vars.reason }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['features', id] }),
  });
}

export interface UpsertFeatureRolloutVars {
  type: string;
  enabled?: boolean;
  percentage?: number | null;
  allowList?: string[];
  blockList?: string[];
  environments?: string[];
  startsAt?: string | null;
  endsAt?: string | null;
  reason: string;
}

export function useUpsertFeatureRollout(id: string) {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertFeatureRolloutVars) =>
      client.request<FeatureRolloutDto>(`/features/${id}/rollouts`, {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['features', id] }),
  });
}

export function useRemoveFeatureRollout(id: string) {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { rolloutId: string; reason: string }) =>
      client.request<void>(`/features/${id}/rollouts/${vars.rolloutId}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason: vars.reason }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['features', id] }),
  });
}

export function useSetFeatureKillSwitch(id: string) {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { enabled: boolean; reason: string }) =>
      client.post<FeatureRolloutDto>(`/features/${id}/kill-switch`, vars),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['features', id] }),
  });
}

// --- Analytics ---------------------------------------------------------------

export function useDashboard() {
  const client = useApiClient();
  return useQuery({
    queryKey: ['analytics', 'dashboard'] as const,
    queryFn: () => client.get<DashboardAggregatesDto>('/analytics/dashboard'),
    staleTime: 60 * 1000,
  });
}

export function usePendingActions() {
  const client = useApiClient();
  return useQuery({
    queryKey: ['analytics', 'pending-actions'] as const,
    queryFn: () => client.get<PendingActionsDto>('/analytics/pending-actions'),
    staleTime: 30 * 1000,
  });
}

// --- Audit + activity --------------------------------------------------------

export interface AuditFilter {
  search?: string;
  module?: string;
  action?: string;
  actorId?: string;
  institutionId?: string;
  entityType?: string;
  entityId?: string;
  riskLevel?: string;
  result?: string;
  supportSessionId?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export function useAuditEvents(filter: AuditFilter = {}) {
  const client = useApiClient();
  const params = filter as Record<string, unknown>;
  return useInfiniteQuery({
    queryKey: ['audit', params] as const,
    queryFn: ({ pageParam }) =>
      client.get<AuditEventPage>(`/audit${qs({ ...params, cursor: pageParam })}`),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export function useAuditEvent(id: string, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['audit', 'event', id] as const,
    queryFn: () => client.get<AuditEventDto>(`/audit/${id}`),
    enabled: Boolean(id) && enabled,
  });
}

export interface ActivityFilter {
  category?: string;
  institutionId?: string;
  riskLevel?: string;
  limit?: number;
}

export function useActivityFeed(filter: ActivityFilter = {}) {
  const client = useApiClient();
  const params = filter as Record<string, unknown>;
  return useInfiniteQuery({
    queryKey: ['activity', params] as const,
    queryFn: ({ pageParam }) =>
      client.get<ActivityEventPage>(`/audit/activity${qs({ ...params, cursor: pageParam })}`),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

/**
 * Download the filtered audit log as CSV. Fetches through the client (so auth headers/cookies
 * are attached, unlike a plain navigation) and triggers a browser download from a blob.
 */
export function useAuditExport() {
  const client = useApiClient();
  return useMutation({
    mutationFn: async (filter: AuditFilter) => {
      const csv = await client.getText(`/audit/export${qs(filter as Record<string, unknown>)}`);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return csv.length;
    },
  });
}

// --- AI governance -----------------------------------------------------------

export interface AiPoliciesFilter {
  scope?: string;
  mode?: string;
  page?: number;
  pageSize?: number;
}

export function useAiOverview() {
  const client = useApiClient();
  return useQuery({
    queryKey: ['ai-governance', 'overview'] as const,
    queryFn: () => client.get<AiGovernanceOverviewDto>('/ai-governance/overview'),
    staleTime: 30 * 1000,
  });
}

export function useAiPolicies(filter: AiPoliciesFilter = {}) {
  const client = useApiClient();
  const params = filter as Record<string, unknown>;
  return useQuery({
    queryKey: ['ai-governance', 'policies', params] as const,
    queryFn: () => client.get<AiPolicyList>(`/ai-governance/policies${qs(params)}`),
    placeholderData: (prev) => prev,
  });
}

export function useAiRules() {
  const client = useApiClient();
  return useQuery({
    queryKey: ['ai-governance', 'rules'] as const,
    queryFn: () => client.get<AiActionRuleDto[]>('/ai-governance/rules'),
  });
}

export interface AiPolicyContext {
  planId?: string;
  institutionId?: string;
  campusId?: string;
  institutionUserId?: string;
  independentUserId?: string;
  employeeRoleKeys?: string;
}

export function useEffectiveAiPolicy(ctx: AiPolicyContext, enabled = true) {
  const client = useApiClient();
  const params = ctx as Record<string, unknown>;
  return useQuery({
    queryKey: ['ai-governance', 'effective-policy', params] as const,
    queryFn: () => client.get<EffectiveAiPolicyDto>(`/ai-governance/effective-policy${qs(params)}`),
    enabled,
  });
}

export interface EvaluateGuardrailVars {
  proposed: {
    capability: string;
    action: string;
    requiredPermission?: string;
    financialImpactMinor?: number;
    affectedUsers?: number;
    riskLevel?: string;
    reversible?: boolean;
  };
  context?: Record<string, unknown>;
}

/** Run a proposed action through the guardrail evaluator (read-only preview). */
export function useEvaluateGuardrail() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (input: EvaluateGuardrailVars) =>
      client.post<GuardrailResultDto>('/ai-governance/evaluate', {
        proposed: input.proposed,
        context: input.context ?? {},
      }),
  });
}

function invalidateAiGovernance(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['ai-governance'] });
}

export interface UpsertAiPolicyVars {
  scope: string;
  scopeId?: string | null;
  enabled?: boolean;
  mode: string;
  capabilities?: Record<string, boolean>;
  maxFinancialImpactMinor?: number | null;
  maxAffectedUsers?: number | null;
  twoPersonThresholdMinor?: number | null;
  secondApproverCapabilities?: string[];
  reason: string;
  version?: number;
}

export function useUpsertAiPolicy() {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertAiPolicyVars) => client.post<AiPolicyDto>('/ai-governance/policies', input),
    onSuccess: () => invalidateAiGovernance(qc),
  });
}

export function useRemoveAiPolicy() {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; reason: string }) =>
      client.request<void>(`/ai-governance/policies/${vars.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason: vars.reason }),
      }),
    onSuccess: () => invalidateAiGovernance(qc),
  });
}

export function useSetAiKillSwitch() {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { scope: string; scopeId?: string | null; enabled: boolean; reason: string }) =>
      client.post<AiPolicyDto>('/ai-governance/kill-switch', vars),
    onSuccess: () => invalidateAiGovernance(qc),
  });
}

export interface UpsertAiRuleVars {
  capability: string;
  action?: string | null;
  enabled?: boolean;
  effect: string;
  riskLevel?: string | null;
  description?: string | null;
  reason: string;
  version?: number;
}

export function useUpsertAiRule() {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertAiRuleVars) => client.post<AiActionRuleDto>('/ai-governance/rules', input),
    onSuccess: () => invalidateAiGovernance(qc),
  });
}

export function useRemoveAiRule() {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; reason: string }) =>
      client.request<void>(`/ai-governance/rules/${vars.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason: vars.reason }),
      }),
    onSuccess: () => invalidateAiGovernance(qc),
  });
}

// --- Copilot run lifecycle ----------------------------------------------------

export interface CopilotContext {
  institutionId?: string;
  campusId?: string;
  planId?: string;
  institutionUserId?: string;
  featureKey?: string;
  paymentId?: string;
  amountMinor?: number;
}

export function useCreateRun() {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { prompt: string; context?: CopilotContext }) =>
      client.post<AiRunDetailDto>('/copilot/runs', { prompt: input.prompt, context: input.context ?? {} }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['copilot'] }),
  });
}

export function useRun(id: string, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: ['copilot', 'run', id] as const,
    queryFn: () => client.get<AiRunDetailDto>(`/copilot/runs/${id}`),
    enabled: Boolean(id) && enabled,
  });
}

export function useConfirmRun(id: string) {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { reason: string; confirmationText?: string }) =>
      client.post<AiRunDetailDto>(`/copilot/runs/${id}/confirm`, vars),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['copilot'] }),
  });
}

export function useRejectRun(id: string) {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { reason: string }) => client.post<AiRunDetailDto>(`/copilot/runs/${id}/reject`, vars),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['copilot'] }),
  });
}

export function useApproveRun(id: string) {
  const client = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { approved?: boolean; reason: string }) =>
      client.post<AiRunDetailDto>(`/copilot/runs/${id}/approve`, { approved: vars.approved ?? true, reason: vars.reason }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['copilot'] }),
  });
}

export interface AiRunsFilter {
  status?: string;
  employeeId?: string;
  search?: string;
  riskLevel?: string;
  limit?: number;
}

/** AI audit surface — searchable, cursor-paginated run log. */
export function useAiRuns(filter: AiRunsFilter = {}) {
  const client = useApiClient();
  const params = filter as Record<string, unknown>;
  return useInfiniteQuery({
    queryKey: ['copilot', 'runs', params] as const,
    queryFn: ({ pageParam }) =>
      client.get<AiRunPage>(`/copilot/runs${qs({ ...params, cursor: pageParam })}`),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

// --- System health -----------------------------------------------------------

export function useSystemHealth() {
  const client = useApiClient();
  return useQuery({
    queryKey: ['system', 'health'] as const,
    queryFn: () => client.get<SystemHealthDto>('/system/health'),
    refetchInterval: 30 * 1000,
  });
}

// --- Institution registration requests (reviewer workspace) ------------------

export interface RegistrationsFilter {
  search?: string;
  status?: string;
  type?: string;
  country?: string;
  reviewerId?: string;
  minStudents?: number;
  maxStudents?: number;
  submittedFrom?: string;
  submittedTo?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export function useRegistrationRequests(filter: RegistrationsFilter) {
  const client = useApiClient();
  const params = filter as Record<string, unknown>;
  return useQuery({
    queryKey: queryKeys.registrationRequests(params),
    queryFn: () => client.get<RegistrationList>(`/registration-requests${qs(params)}`),
    placeholderData: (prev) => prev,
  });
}

export function useRegistrationsSummary() {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.registrationSummary,
    queryFn: () => client.get<RegistrationStatusSummary>('/registration-requests/summary'),
  });
}

export function useRegistrationRequest(id: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.registrationRequest(id),
    queryFn: () => client.get<RegistrationDetailDto>(`/registration-requests/${id}`),
    enabled: Boolean(id),
  });
}

/** Invalidate the list, the summary and a request's detail after a reviewer mutation. */
function useRegistrationInvalidate(id: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['registration-requests'] });
    void qc.invalidateQueries({ queryKey: queryKeys.registrationRequest(id) });
  };
}

export function useStartRegistrationReview(id: string) {
  const client = useApiClient();
  const invalidate = useRegistrationInvalidate(id);
  return useMutation({
    mutationFn: (input: { version: number }) =>
      client.post<RegistrationRequestDto>(`/registration-requests/${id}/start-review`, input),
    onSuccess: invalidate,
  });
}

export function useAssignRegistrationReviewer(id: string) {
  const client = useApiClient();
  const invalidate = useRegistrationInvalidate(id);
  return useMutation({
    mutationFn: (input: { reviewerId: string; version: number }) =>
      client.post<RegistrationRequestDto>(`/registration-requests/${id}/assign`, input),
    onSuccess: invalidate,
  });
}

export function useAddRegistrationNote(id: string) {
  const client = useApiClient();
  const invalidate = useRegistrationInvalidate(id);
  return useMutation({
    mutationFn: (input: { note: string }) =>
      client.post<RegistrationRequestDto>(`/registration-requests/${id}/notes`, input),
    onSuccess: invalidate,
  });
}

export interface ApproveRegistrationPayload {
  version: number;
  supportTier?: 'standard' | 'priority' | 'enterprise';
  planKey?: string;
  campus: { name: string; code?: string };
  admin: {
    fullName: string;
    email: string;
    roleKeys?: string[];
    credentialDelivery?: 'activation' | 'temporary_password';
  };
  note?: string;
}

export function useApproveRegistration(id: string) {
  const client = useApiClient();
  const invalidate = useRegistrationInvalidate(id);
  return useMutation({
    mutationFn: (input: ApproveRegistrationPayload) =>
      client.post<RegistrationApprovalResultDto>(`/registration-requests/${id}/approve`, input),
    onSuccess: () => {
      invalidate();
    },
  });
}

export function useRejectRegistration(id: string) {
  const client = useApiClient();
  const invalidate = useRegistrationInvalidate(id);
  return useMutation({
    mutationFn: (input: { version: number; reason: string; internalNote?: string }) =>
      client.post<RegistrationRequestDto>(`/registration-requests/${id}/reject`, input),
    onSuccess: invalidate,
  });
}
