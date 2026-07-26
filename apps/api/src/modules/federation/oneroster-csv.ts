/** Parse a minimal OneRoster 1.1 users CSV (header row required). */
export function parseOnerosterUsersCsv(csv: string): Array<{
  sourcedId: string;
  givenName: string;
  familyName: string;
  email: string;
  role: string;
}> {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0]!.split(',').map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const si = idx('sourcedid');
  const gi = idx('givenname');
  const fi = idx('familyname');
  const ei = idx('email');
  const ri = idx('role');
  if (si === -1) return [];

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split(',').map((c) => c.trim());
    const sourcedId = cols[si];
    if (!sourcedId) continue;
    rows.push({
      sourcedId,
      givenName: gi >= 0 ? cols[gi] ?? '' : '',
      familyName: fi >= 0 ? cols[fi] ?? '' : '',
      email: ei >= 0 ? (cols[ei] ?? '').toLowerCase() : '',
      role: ri >= 0 ? cols[ri] ?? 'student' : 'student',
    });
  }
  return rows;
}
