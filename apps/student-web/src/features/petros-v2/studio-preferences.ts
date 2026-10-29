export const studioPreferenceKey = 'petros-studio-preferences:v1';
export type StudioPreferences = {
  reducedMotion: boolean;
  textOnly: boolean;
  hidden: boolean;
  compact: boolean;
};
export const defaultStudioPreferences: StudioPreferences = {
  reducedMotion: false,
  textOnly: false,
  hidden: false,
  compact: false,
};

/** Device presentation preferences only. Never stores a learner or lesson payload. */
export function readStudioPreferences(raw: string | null): StudioPreferences {
  try {
    const parsed: unknown = JSON.parse(raw ?? 'null');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return { ...defaultStudioPreferences };
    return Object.fromEntries(
      Object.entries(defaultStudioPreferences).map(([key, fallback]) => [
        key,
        typeof (parsed as Record<string, unknown>)[key] === 'boolean'
          ? (parsed as Record<string, boolean>)[key]
          : fallback,
      ]),
    ) as StudioPreferences;
  } catch {
    return { ...defaultStudioPreferences };
  }
}
