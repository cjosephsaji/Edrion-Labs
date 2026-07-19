'use client';
import { useEffect, useRef, useState } from 'react';
import { Checkbox, Label } from '@edrion/ui';
import { RoleMultiSelect } from './role-multi-select';
import type { ResourceFormExtraApi } from '@/components/academics/resource-form';
import {
  effectivePortalLogin,
  hasPortalLoginEmail,
  portalLoginAfterEmailChange,
} from '@/lib/portal-login-email';

/** Edit-time portal login setup when a staff row has no linked institution user yet. */
export function StaffPortalLoginSetup({
  email,
  canManage,
  setSubmitPayload,
}: {
  email: string | null;
  canManage: boolean;
  setSubmitPayload?: ResourceFormExtraApi['setSubmitPayload'];
}) {
  const hasEmail = hasPortalLoginEmail(email);
  const [createLogin, setCreateLogin] = useState(() => hasEmail);
  const [roleKeys, setRoleKeys] = useState<string[]>([]);
  const prevHasEmail = useRef(hasEmail);

  useEffect(() => {
    setCreateLogin((current) => portalLoginAfterEmailChange(prevHasEmail.current, hasEmail, current));
    prevHasEmail.current = hasEmail;
  }, [hasEmail]);

  useEffect(() => {
    if (!effectivePortalLogin(email, createLogin)) setRoleKeys([]);
  }, [createLogin, email]);

  useEffect(() => {
    if (!setSubmitPayload) return;
    const active = effectivePortalLogin(email, createLogin);
    setSubmitPayload({
      createLogin: active,
      roleKeys: active ? roleKeys : [],
    });
  }, [createLogin, email, roleKeys, setSubmitPayload]);

  const active = effectivePortalLogin(email, createLogin);

  if (!canManage) {
    return (
      <p className="text-sm text-text-muted">This staff member has no portal login.</p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">Portal login</h3>
        <p className="text-xs text-text-muted">Provision a user account so this staff member can sign in.</p>
      </div>
      <label className="flex cursor-pointer items-center gap-2.5">
        <Checkbox
          checked={active}
          onChange={(e) => {
            if (!hasEmail) return;
            setCreateLogin(e.target.checked);
          }}
        />
        <span className="text-sm font-medium text-text-primary">Create portal login</span>
      </label>
      {!hasEmail && (
        <p className="text-xs text-text-muted">Add an email address above to enable portal login.</p>
      )}
      <div>
        <Label>
          Portal roles
          {active ? <span className="text-danger"> *</span> : null}
        </Label>
        <p className="mb-2 text-xs text-text-muted">
          {active
            ? 'Required when creating a portal login.'
            : hasEmail
              ? 'Enable “Create portal login” to assign roles.'
              : 'Add an email address above to assign portal roles.'}
        </p>
        <RoleMultiSelect value={roleKeys} onChange={setRoleKeys} />
      </div>
    </div>
  );
}
