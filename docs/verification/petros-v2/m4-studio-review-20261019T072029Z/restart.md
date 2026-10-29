# Restarting this isolated M4 review

The retained services currently use API 4953, web 4954 and gallery 4955, bound to 127.0.0.1. Leave other development services on 4943/4944/4945 untouched. All database records are disposable synthetic fixtures. Nothing requires a configured database, paid provider, migration on an application target or external deployment.

If the M4 services stop, from apps/api use Node 24.21.0 and ensure the installed PostgreSQL bin and redis-local/src directories are on PATH. Do not load the workspace .env. The script refuses DATABASE_URL, DATABASE_MIGRATION_URL and PG target variables. Set PETROS_M4_EVIDENCE_DIR to a new timestamped directory, PETROS_STUDIO_API_PORT=4953 and PETROS_STUDIO_WEB_PORT=4954, then run node -r ts-node/register/transpile-only -r tsconfig-paths/register scripts/serve-petros-studio.ts. New service startup creates new disposable session IDs.

From apps/student-web set PETROS_ISOLATED_VERIFICATION=1, PETROS_M4_VERIFICATION=1, PETROS_STUDIO_INSTANCE=review-20261019, NEXT_PUBLIC_PETROS_M4_DEMO=1 and NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4953, then run node node_modules/next/dist/bin/next dev -p 4954 -H 127.0.0.1. The instance isolates generated build assets.

Serve this evidence directory with python3 -m http.server 4955 --bind 127.0.0.1 --directory <absolute evidence directory>. Start by opening http://127.0.0.1:4955/review.html. For a fresh browser recording, use a new PETROS_STUDIO_BROWSER_DIR, set PETROS_STUDIO_BROWSER_API=http://127.0.0.1:4953 and run apps/api/scripts/verify-petros-studio-browser.mjs from apps/api. Existing output directories are intentionally refused.
