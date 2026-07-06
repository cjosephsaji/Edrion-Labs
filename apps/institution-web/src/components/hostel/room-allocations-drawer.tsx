'use client';
import { Drawer } from '@edrion/ui';
import type { HostelRoomRow } from '@/lib/hostel-types';
import { RoomAllocationsPanel } from './room-allocations-panel';

/** @deprecated Prefer `RoomAllocationsPanel` inside the room edit form. */
export function RoomAllocationsDrawer({
  room,
  open,
  onClose,
}: {
  room: HostelRoomRow | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Drawer open={open} onClose={onClose} title="Allocations" description={room ? `Room ${room.roomNo}` : ''}>
      {room && (
        <RoomAllocationsPanel
          roomId={room.id}
          roomNo={room.roomNo}
          capacity={room.capacity}
          occupied={room.occupied}
          available={room.available}
        />
      )}
    </Drawer>
  );
}

export { RoomAllocationsPanel } from './room-allocations-panel';
