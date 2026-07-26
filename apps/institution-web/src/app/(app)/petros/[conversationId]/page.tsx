'use client';
import { useParams } from 'next/navigation';
import { PermissionDenied } from '@edrion/ui';
import { usePermissions } from '@/lib/permissions';
import { PetrosShell } from '@/components/petros/petros-shell';

export default function PetrosConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { can } = usePermissions();
  if (!can('ai.use')) return <PermissionDenied />;
  return <PetrosShell conversationId={conversationId} />;
}
