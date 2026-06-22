#!/usr/bin/env bash
# Create the Secret Manager secrets the Cloud Functions read at runtime.
# Run once, then grant the Functions runtime service account access (the deploy
# step with secrets binding does this automatically when you reference them).
set -euo pipefail

PROJECT_ID="${1:-somini-board}"
gcloud config set project "$PROJECT_ID"

create_secret () {
  local name="$1"
  if ! gcloud secrets describe "$name" >/dev/null 2>&1; then
    gcloud secrets create "$name" --replication-policy="automatic"
  fi
  echo "Enter value for $name:"
  read -rs VALUE
  printf "%s" "$VALUE" | gcloud secrets versions add "$name" --data-file=-
}

create_secret PAYMOB_API_KEY
create_secret PAYMOB_INTEGRATION_ID
create_secret PAYMOB_IFRAME_ID
create_secret PAYMOB_HMAC

echo "Secrets created. Bind them on deploy, e.g.:"
echo "  firebase deploy --only functions"
echo "and declare runWith secrets, or set via:  gcloud run services update ..."
