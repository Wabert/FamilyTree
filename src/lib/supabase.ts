import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * The shared database, or null when no Supabase project is configured in
 * .env.local. With null the app runs in demo mode, saving to this browser only.
 */
function readLinkError(): string {
  if (typeof window === "undefined") return "";
  const { hash, search } = window.location;
  for (const part of [hash.replace(/^#/, ""), search]) {
    const params = new URLSearchParams(part);
    const code = params.get("error_code");
    const description = params.get("error_description");
    if (!code && !description) continue;
    if (code === "otp_expired") {
      return "That sign-in link has expired or was already used. Enter your email to get a new one, and open only the newest email.";
    }
    return `That sign-in link didn’t work${description ? ` (${description})` : ""}. Enter your email to get a new one.`;
  }
  return "";
}

/**
 * Why the sign-in link that opened this page failed, or "". Read here, before the
 * client starts, because Supabase clears it from the address bar.
 */
export const signInLinkError = readLinkError();

export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;
