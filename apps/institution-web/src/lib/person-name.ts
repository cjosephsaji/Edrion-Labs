import { formatPersonName } from '@edrion/schemas';

export { formatPersonName };

export type NamedPerson = { firstName: string; middleName?: string | null; lastName: string };

/** Display label with optional trailing meta (e.g. admission number). */
export function namedPersonLabel(person: NamedPerson, meta?: string | null): string {
  const name = formatPersonName(person);
  return meta ? `${name} (${meta})` : name;
}
