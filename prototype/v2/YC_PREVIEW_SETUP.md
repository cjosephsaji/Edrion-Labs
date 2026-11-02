# YC reviewer access

The current prototype uses one shared YC reviewer account. It has no registration, email delivery, or individual learner profiles. Lesson progress stays in the current browser. AI and the world remain paused independently of login.

Run `npx tsx scripts/setup-yc-login.mts` to generate the account and a separate session-signing key. The script writes private, Git-ignored files with owner-only permissions. It preserves the existing OpenAI key and does not include it in the Netlify import file. Re-running the script preserves the reviewer password; `--rotate` explicitly changes the password and signing secret and invalidates previous sessions.

Configure these server-side environment variables in Netlify:

| Variable | Purpose |
| --- | --- |
| `NODE_VERSION` | `22` |
| `PETROS_V2_ACCESS_SECRET` | Random session-signing key, at least 32 characters |
| `PETROS_V2_YC_USERNAME` | Reviewer username from the generated access details |
| `PETROS_V2_YC_PASSWORD_HASH` | Generated salted PBKDF2-HMAC-SHA256 hash; 600,000 iterations |
| `UPSTASH_REDIS_REST_URL` | HTTPS REST endpoint from the preview’s Upstash database |
| `UPSTASH_REDIS_REST_TOKEN` | Standard REST token with read/write command access |

Use Netlify’s **Import from .env** option with `.env.netlify.local`. The reviewer password is in `YC_ACCESS_DETAILS.local.md`; share only the username/password, never the signing key or Redis token. No credentials belong in GitHub or `NEXT_PUBLIC_` variables.

Deployment settings: branch `prototype`, base `prototype/v2`, build `npm run build`, publish `.next`; leave custom functions unset. The live URL ends in `/prototype` (the root redirects there).

Login verifies both username and password, sets an eight-hour HttpOnly/SameSite cookie, and uses Secure cookies over HTTPS. Sign out clears the cookie. Password or signing-key changes invalidate existing sessions. Each reviewer account shares its AI request budget across sessions. Redis limits login attempts by client IP; production does not fall back to instance-local counters if Redis is absent or unavailable. Old passphrase-only previews still work when both YC account settings are absent; once either YC account setting is supplied, incomplete account configuration fails closed.

Before inviting reviewers, verify one wrong-password attempt, a successful login, the prepared questions, page reload, and sign out on the deployed URL. Local production browser tests cover the same flow; they do not by themselves prove a Netlify deployment works.
