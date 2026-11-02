import { execute, type Simulation, type SimTool } from '../simulations/runtime';
export const toolNames = [
  'sim_set_params',
  'sim_run',
  'sim_pause',
  'sim_step',
  'sim_observe',
  'sim_experiment',
  'sim_reset',
  'sim_restore',
  'sim_brake',
  'sim_scale_mass',
] as const;
export function routeTool(state: Simulation, name: string, argsJson: string) {
  if (!toolNames.includes(name as SimTool))
    throw Error('Unknown simulation tool.');
  if (typeof argsJson !== 'string' || argsJson.length > 20000)
    throw Error('Invalid tool arguments.');
  const args = JSON.parse(argsJson);
  if (!args || typeof args !== 'object' || Array.isArray(args))
    throw Error('Tool arguments must be an object.');
  return execute(state, name as SimTool, args);
}
