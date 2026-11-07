#!/usr/bin/env bash
# Link the project, push env vars, deploy to production, then point Supabase
# Auth at the resulting domain.
#
# Requires: `npx vercel login` already done (or VERCEL_TOKEN exported).
#
#   bash scripts/deploy-vercel.sh
set -euo pipefail

cd "$(dirname "$0")/.."
PROJECT=taposnaba
V="npx --yes vercel@latest"

echo "→ account"
$V whoami

echo "→ linking project '$PROJECT' (creates it if missing)"
$V link --yes --project "$PROJECT"

# ---------------------------------------------------------------------------
# Environment variables, read from .env.local
# ---------------------------------------------------------------------------
set -a
# shellcheck disable=SC1091
source .env.local
set +a

put() { # put NAME VALUE
  local name=$1 value=$2
  for target in production preview development; do
    # --force overwrites so re-running the script is safe
    printf '%s' "$value" | $V env add "$name" "$target" --force >/dev/null 2>&1 \
      || echo "     (warn: could not set $name for $target)"
  done
  echo "   set $name"
}

echo "→ environment variables"
put NEXT_PUBLIC_SUPABASE_URL "$NEXT_PUBLIC_SUPABASE_URL"
put NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY "$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
put SUPABASE_SECRET_KEY "$SUPABASE_SECRET_KEY"
put CRON_SECRET "$CRON_SECRET"

echo "→ deploying to production"
$V deploy --prod --yes | tee /tmp/vercel-deploy.out

URL=$(grep -Eo 'https://[a-zA-Z0-9._-]+\.vercel\.app' /tmp/vercel-deploy.out | tail -1)
echo "→ deployed: $URL"
echo "$URL" > .vercel-url.txt
