/**
 * Regional pricing. Resolves a price from the caller's IP using geoip-lite,
 * with a light VPN/proxy heuristic. Egypt gets the local tier; GCC gets the
 * premium tier; everyone else the standard tier. These are *base* numbers —
 * tune them or move them to Remote Config as the business evolves.
 */
import geoip from "geoip-lite";

export type Tier = "egypt" | "gulf" | "standard";

const GCC = new Set(["SA", "AE", "QA", "KW", "BH", "OM"]);

// Amounts are in the smallest currency unit (e.g. piastres / cents).
export interface PriceBook {
  meetingFee: number; // pay-per-election for non-subscribers
  monthly: number;
  yearly: number;
  currency: string;
}

const PRICES: Record<Tier, PriceBook> = {
  egypt: { meetingFee: 50000, monthly: 150000, yearly: 1500000, currency: "EGP" },
  gulf: { meetingFee: 30000, monthly: 9900, yearly: 99000, currency: "USD" },
  standard: { meetingFee: 20000, monthly: 4900, yearly: 49000, currency: "USD" },
};

export function tierForCountry(country?: string | null): Tier {
  if (!country) return "standard";
  if (country === "EG") return "egypt";
  if (GCC.has(country)) return "gulf";
  return "standard";
}

/**
 * Very small proxy/VPN heuristic: geoip-lite has no proxy DB, so we flag known
 * hosting/cloud ranges only as a hint. For production, plug in a paid IP
 * intelligence provider; this keeps the surface honest without overpromising.
 */
function looksLikeProxy(ip: string): boolean {
  // Datacenter ranges commonly fronting VPNs (non-exhaustive heuristic).
  return /^(?:104\.|172\.6[4-9]\.|172\.7\d\.|45\.|185\.)/.test(ip);
}

export function resolvePricing(ip: string | undefined): {
  tier: Tier;
  country: string | null;
  suspectedProxy: boolean;
  prices: PriceBook;
} {
  const clean = (ip ?? "").split(",")[0].trim();
  const geo = clean ? geoip.lookup(clean) : null;
  const country = geo?.country ?? null;
  const suspectedProxy = clean ? looksLikeProxy(clean) : false;
  // If we suspect a proxy, fall back to standard tier to avoid abuse of EG pricing.
  const tier = suspectedProxy ? "standard" : tierForCountry(country);
  return { tier, country, suspectedProxy, prices: PRICES[tier] };
}
