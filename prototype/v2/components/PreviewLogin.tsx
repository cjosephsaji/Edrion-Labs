import s from './preview-login.module.css';

export function PreviewLogin({
  account,
  ready,
  retry,
  aiPaused,
}: {
  account: boolean;
  ready: boolean;
  retry?: string;
  aiPaused: boolean;
}) {
  const error =
    retry === 'rate-limit'
      ? 'Too many sign-in attempts. Please try again in an hour.'
      : retry === 'unavailable'
        ? 'Sign-in is temporarily unavailable. Please contact the person who shared this preview.'
        : retry
          ? account
            ? 'That username or password didn’t match. Please try again.'
            : 'That passphrase didn’t match. Please try again.'
          : '';
  return (
    <main className={s.page}>
      <a className={s.brand} href="/prototype">
        <span>p</span>petros
      </a>
      <div className={s.welcome}>
        <div className={s.intro}>
          <div className={s.portrait}>
            <img
              src="/petros/petros-idle.png"
              alt="Petros, your learning guide"
              width={150}
              height={200}
            />
          </div>
          <p className={s.eyebrow}>YC / PRIVATE PREVIEW</p>
          <h1>
            A place for
            <br />
            your curiosity.
          </h1>
          <p>
            Five ideas to explore.
            <br />
            One patient guide to help things click.
          </p>
          <div className={s.topics}>
            <span>Neural learning</span>
            <span>Rocket landing</span>
            <span>Attention</span>
            <span>Traffic waves</span>
            <span>Time dilation</span>
          </div>
        </div>
        <form
          className={s.form}
          method="post"
          action="/prototype/api/login"
          aria-label="Preview sign in"
        >
          <span className={s.eyebrow}>YOUR INVITATION TO EXPLORE</span>
          <h2>Welcome to Petros.</h2>
          <p>
            {account
              ? 'Sign in with your YC preview account.'
              : 'Enter your preview passphrase to begin.'}
          </p>
          {!ready && (
            <p className={s.notice} role="status">
              This preview is being prepared. Please contact the person who
              shared it for access.
            </p>
          )}
          {error && (
            <p className={s.error} role="alert" id="login-error">
              {error}
            </p>
          )}
          {account && (
            <label htmlFor="username">
              Username
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={64}
                required
                aria-describedby={error ? 'login-error' : undefined}
              />
            </label>
          )}
          <label htmlFor="password">
            {account ? 'Password' : 'Preview passphrase'}
            <input
              id="password"
              name={account ? 'password' : 'secret'}
              type="password"
              autoComplete="current-password"
              maxLength={256}
              required
              aria-describedby={error ? 'login-error' : undefined}
            />
          </label>
          <button type="submit" disabled={!ready}>
            Enter the study <span aria-hidden="true">→</span>
          </button>
          <small>Use the details supplied with your invitation.</small>
          <div className={s.footnote}>
            <i />
            {aiPaused
              ? 'Prepared lessons. Live simulations. AI paused.'
              : 'Learn through live experiments with Petros.'}
          </div>
        </form>
      </div>
      <footer>
        EDRION / LEARN BY EXPLORING{' '}
        <span>Your lesson progress stays in this browser.</span>
      </footer>
    </main>
  );
}
