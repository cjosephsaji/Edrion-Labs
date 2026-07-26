'use client';
import { PermissionDenied } from '@edrion/ui';
import { usePermissions } from '@/lib/permissions';
import { PetrosShell } from '@/components/petros/petros-shell';

export default function PetrosPage() {
  const { can } = usePermissions();
  if (!can('ai.use')) return <PermissionDenied />;
  return <PetrosShell conversationId={null} />;
}
