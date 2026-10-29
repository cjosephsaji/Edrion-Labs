import type { SimulationRequest } from '@edrion/schemas';
type Field = { key: string; label: string; min: number; max: number; unit: string };
export const experimentUI: Record<
  SimulationRequest['kernel'],
  { name: string; scope: string; fields: Field[]; outputs: Record<string, string> }
> = {
  'resource-capacity.v1': {
    name: 'Memory capacity',
    scope:
      'This model treats memory as the only limit. It uses equal memory needs for every VM.',
    fields: [
      { key: 'totalGB', label: 'Total memory', min: 0, max: 1e6, unit: 'GB' },
      { key: 'reservedGB', label: 'Memory set aside', min: 0, max: 1e6, unit: 'GB' },
      { key: 'perVMGB', label: 'Memory per VM', min: 0, max: 1e6, unit: 'GB/VM' },
    ],
    outputs: { availableGB: 'Available memory (GB)', capacity: 'Whole VMs' },
  },
  'linear-rate.v1': {
    name: 'Constant rate',
    scope:
      'This model assumes a constant rate throughout the selected time, without losses or interruptions.',
    fields: [
      { key: 'rate', label: 'Request rate', min: 0, max: 1e6, unit: 'requests/second' },
      { key: 'seconds', label: 'Elapsed time', min: 0, max: 1e4, unit: 'seconds' },
    ],
    outputs: { requests: 'Requests' },
  },
  'projectile-no-drag.v1': {
    name: 'Motion under gravity',
    scope:
      'This model assumes uniform gravity and no air resistance. The checked point describes the selected time.',
    fields: [
      {
        key: 'vx',
        label: 'Initial horizontal velocity',
        min: -100,
        max: 100,
        unit: 'm/s',
      },
      { key: 'vy', label: 'Initial upward velocity', min: 0, max: 100, unit: 'm/s' },
      { key: 'gravity', label: 'Gravity', min: 1, max: 25, unit: 'm/s²' },
      { key: 'seconds', label: 'Elapsed time', min: 0, max: 200, unit: 'seconds' },
    ],
    outputs: {
      x: 'Horizontal position (m)',
      y: 'Vertical position (m)',
      vx: 'Horizontal velocity (m/s)',
      vy: 'Vertical velocity (m/s)',
    },
  },
};
