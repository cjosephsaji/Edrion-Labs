/** Client-side mirrors of the portal Administration DTOs (Phase 11). The API is authoritative. */

export type SettingCategory = 'general' | 'academic' | 'branding' | 'localization' | 'notifications' | 'security';
export type SettingValueType = 'string' | 'number' | 'boolean' | 'json';

export interface SettingRow {
  id: string;
  institutionId: string;
  campusId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  category: SettingCategory;
  key: string;
  label: string;
  valueType: SettingValueType;
  value: string | null;
  description: string | null;
}

export interface RoleRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  permissions: string[];
  permissionCount: number;
  isSystem: boolean;
  source: 'default' | 'custom';
  inUse: number;
  version: number;
  createdAt: string | null;
}

export type UserStatus = 'invited' | 'active' | 'disabled' | 'locked' | 'pending_deletion';

export interface UserRow {
  id: string;
  institutionId: string;
  email: string;
  fullName: string;
  phone: string | null;
  status: UserStatus;
  mfaEnrolled: boolean;
  requireMfa: boolean;
  directGrants: string[];
  directDenies: string[];
  lastLoginAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  roleKeys: string[];
  campusIds: string[];
  campusCount: number;
  /** Set when the user account was provisioned from a staff record. */
  provisionedFromStaffId?: string | null;
  provisionedFromStaffName?: string | null;
}

export interface AuditRow {
  id: string;
  occurredAt: string;
  actorType: string;
  actorName: string | null;
  actorRole: string | null;
  campusId: string | null;
  action: string;
  module: string;
  entityType: string | null;
  entityId: string | null;
  result: string;
  riskLevel: string;
  aiInvolved: boolean;
  ip: string | null;
}

export interface PermissionDef {
  key: string;
  group: string;
  description: string;
  sensitive: boolean;
}
