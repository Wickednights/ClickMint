/**
 * Canonical public URL for Open Graph, WalletConnect metadata (SSR), and links.
 *
 * Prefer setting `NEXT_PUBLIC_SITE_URL` on Vercel for **Production** and **Preview**
 * (e.g. `https://clickmint.app` vs `https://preview.clickmint.app`) so metadata matches
 * the hostname users see.
 */
export function getSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (process.env.VERCEL_ENV === "production") return "https://clickmint.app";
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
