'use client';
import { useEffect, useRef, useState } from 'react';
import { Checkbox } from '@edrion/ui';
import type { ResourceFormExtraApi } from '@/components/academics/resource-form';
import {
  effectivePortalLogin,
  hasPortalLoginEmail,
  portalLoginAfterEmailChange,
} from '@/lib/portal-login-email';

/** Edit-time portal login setup when a parent row has no linked institution user yet. */
export function ParentPortalLoginSetup({
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
  const prevHasEmail = useRef(hasEmail);

  useEffect(() => {
    setCreateLogin((current) => portalLoginAfterEmailChange(prevHasEmail.current, hasEmail, current));
    prevHasEmail.current = hasEmail;
  }, [hasEmail]);

  const active = effectivePortalLogin(email, createLogin);

  useEffect(() => {
    if (!setSubmitPayload) return;
    setSubmitPayload({ createLogin: active });
  }, [active, setSubmitPayload]);

  if (!canManage) {
    return <p className="text-sm text-text-muted">This parent has no portal login.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">Portal login</h3>
        <p className="text-xs text-text-muted">
          Invite this parent to sign in to the institution portal with the <span className="font-medium">Parent</span> role.
          They will land on the <span className="font-medium">Family</span> view after sign-in.
        </p>
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
    </div>
  );
}
