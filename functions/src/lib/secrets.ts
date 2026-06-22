/**
 * Thin wrapper around Google Cloud Secret Manager with an in-process cache so
 * we don't re-fetch the same secret on every invocation of a warm instance.
 */
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

const client = new SecretManagerServiceClient();
const cache = new Map<string, string>();

function projectId(): string {
  const fromConfig = process.env.FIREBASE_CONFIG
    ? JSON.parse(process.env.FIREBASE_CONFIG).projectId
    : undefined;
  const pid =
    process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || fromConfig;
  if (!pid) throw new Error("Unable to resolve GCP project id for Secret Manager");
  return pid;
}

/**
 * Reads the latest version of a secret. Results are cached for the lifetime of
 * the instance; pass `fresh = true` to bypass the cache (e.g. after rotation).
 */
export async function getSecret(name: string, fresh = false): Promise<string> {
  if (!fresh && cache.has(name)) return cache.get(name)!;
  const [version] = await client.accessSecretVersion({
    name: `projects/${projectId()}/secrets/${name}/versions/latest`,
  });
  const payload = version.payload?.data?.toString();
  if (!payload) throw new Error(`Secret ${name} is empty or inaccessible`);
  cache.set(name, payload);
  return payload;
}
