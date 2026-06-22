#!/usr/bin/env bash
# Enable the Google Cloud / Firebase services Somni Board needs.
# Requires: gcloud authenticated with billing-enabled project (Blaze plan for
# Functions 2nd gen, Cloud Tasks, Secret Manager, Identity Platform).
set -euo pipefail

PROJECT_ID="${1:-somini-board}"
echo "Enabling services for project: $PROJECT_ID"

gcloud config set project "$PROJECT_ID"

gcloud services enable \
  cloudfunctions.googleapis.com \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  cloudscheduler.googleapis.com \
  cloudtasks.googleapis.com \
  secretmanager.googleapis.com \
  firestore.googleapis.com \
  firebasestorage.googleapis.com \
  firebasedatabase.googleapis.com \
  identitytoolkit.googleapis.com \
  firebaseappcheck.googleapis.com \
  --project "$PROJECT_ID"

echo "Done. Next steps (one-time, in console or gcloud):"
echo "  1. Upgrade to Blaze billing."
echo "  2. Enable Identity Platform + multi-tenancy (Auth -> Settings)."
echo "  3. Create Firestore (Native mode) + Realtime Database + Storage bucket."
echo "  4. Register App Check with reCAPTCHA v3."
echo "  5. Add Paymob secrets (see scripts/create-secrets.sh)."
