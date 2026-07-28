/** Minimal Learn UI copy (D7). Institution nouns can be injected later via resolveNomenclature. */
const defaults: Record<string, string> = {
  'learn.lesson': 'lesson',
  'learn.session.start_error': "Couldn't start your lesson. Try again in a moment.",
  'learn.session.connection_error': 'Connection lost. Reconnecting…',
  'learn.session.offline': "You're offline. You can read saved blocks; interactions resume when you're back.",
  'learn.progress.remediation': 'Quick detour',
  'learn.remediation_lead': "Let's shore this up first.",
  'learn.completion.title': 'Lesson complete',
};

export function learnCopy(key: string, vars?: Record<string, string>): string {
  let text = defaults[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, v);
    }
  }
  return text;
}
