'use client';
import { Drawer } from '@edrion/ui';
import type { TransportRouteRow } from '@/lib/transport-types';
import { RouteAssignmentsPanel } from './route-assignments-panel';

/** @deprecated Prefer `RouteAssignmentsPanel` inside the route edit form. */
export function RouteAssignmentsDrawer({
  route,
  open,
  onClose,
}: {
  route: TransportRouteRow | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Drawer open={open} onClose={onClose} title="Route assignments" description={route?.name ?? ''}>
      {route && <RouteAssignmentsPanel routeId={route.id} routeName={route.name} />}
    </Drawer>
  );
}

export { RouteAssignmentsPanel } from './route-assignments-panel';
