# Thought cloud content follow-up — 25 October 2026

Removed the character name badge. The close control now occupies a dedicated 44 px grid column inside the padded cloud header, so it no longer crosses or masks the curved outline. Its transparent resting background and visible hover state retain the current palette.

The source explanation is rendered as separate paragraphs. Existing short topic labels such as “Consumer responsibility:” become bold headings. Spacing and dividers separate topics inside one bounded, keyboard-accessible scroll region. The formatter keeps the supplied words, numeric values, punctuation, and ordinary source markup as text; it neither summarizes content nor inserts HTML. The existing hint/request commands and source authorization remain in charge of what text may appear.

All 341 learning-studio tests passed, including two content-preservation tests for the new formatter. Focused lint and standalone type checking passed. The CSS parsed successfully. Browser inspection was attempted but is disabled in Work settings, so this follow-up has no new browser screenshot and makes no claim of completed live visual verification. No alternate account was opened for testing, and the user’s current lesson was not reset.

The current running development preview receives the changes through hot reload. Reopen the explanation with Ask Petros if the existing cloud was dismissed during refresh.
