import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { badRequest, internal } from '../../lib/errors.js';
import { hmac, verifyHmac } from '../crypto.js';

/**
 * Google OAuth 2.0, authorization-code flow with PKCE.
 *
 * No SDK: the three endpoints involved are a stable, documented contract, and a
 * hand-rolled flow keeps the exact token handling and state validation visible
 * rather than behind a library's defaults.
 */

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';

export const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

export function redirectUri(): string {
  return new URL('/api/v1/auth/oauth/google/callback', env.API_URL).toString();
}

/**
 * Opaque state, signed so the callback can trust it without server-side
 * storage. Carries the PKCE verifier and the post-login destination.
 *
 * Shape: `<base64url(payload)>.<hmac>`. Unsigned state is the CSRF hole in most
 * hand-rolled OAuth flows, so the signature is mandatory, not optional.
 */
interface StatePayload {
  nonce: string;
  verifier: string;
  next: string;
  issuedAt: number;
}

const STATE_TTL_MS = 10 * 60 * 1000;

/** Only same-site absolute paths are accepted, to prevent open redirects. */
function safeNext(next: string | undefined): string {
  if (!next) return '/';
  // Browsers read `/\host` as `//host`, so a backslash after the leading
  // slash is as much an off-site redirect as a second slash. Control
  // characters are rejected too, since some parsers strip them.
  if (!next.startsWith('/') || next[1] === '/' || next[1] === '\\' || /[\u0000-\u001f\\]/.test(next)) return '/';
  return next.slice(0, 512);
}

export function createAuthUrl(next?: string): { url: string; state: string } {
  if (!googleEnabled) throw internal('Google sign-in is not configured');

  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const payload: StatePayload = {
    nonce: crypto.randomBytes(16).toString('base64url'),
    verifier,
    next: safeNext(next),
    issuedAt: Date.now(),
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const state = `${encoded}.${hmac(encoded, env.CSRF_SECRET)}`;

  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID!);
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  // Google only returns a verified-email claim reliably with this prompt
  // behaviour, and it avoids silently reusing a stale consent.
  url.searchParams.set('access_type', 'online');
  url.searchParams.set('prompt', 'select_account');

  return { url: url.toString(), state };
}

export function parseState(state: string): StatePayload {
  const idx = state.lastIndexOf('.');
  if (idx <= 0) throw badRequest('Malformed OAuth state');
  const encoded = state.slice(0, idx);
  const signature = state.slice(idx + 1);
  if (!verifyHmac(encoded, signature, env.CSRF_SECRET)) {
    throw badRequest('OAuth state failed verification');
  }
  let payload: StatePayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as StatePayload;
  } catch {
    throw badRequest('Malformed OAuth state');
  }
  if (!payload.verifier || typeof payload.issuedAt !== 'number') throw badRequest('Malformed OAuth state');
  if (Date.now() - payload.issuedAt > STATE_TTL_MS) throw badRequest('This sign-in attempt expired. Please try again.');
  payload.next = safeNext(payload.next);
  return payload;
}

export interface GoogleProfile {
  providerUserId: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string | null;
}

/** Exchanges the authorization code and fetches the profile. */
export async function exchangeCode(code: string, verifier: string): Promise<GoogleProfile> {
  if (!googleEnabled) throw internal('Google sign-in is not configured');

  // Both calls are bounded: a hung provider must not hold a request open.
  const signal = AbortSignal.timeout(10_000);

  const tokenRes = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
    signal,
  });

  if (!tokenRes.ok) {
    throw badRequest('Google rejected the sign-in attempt. Please try again.');
  }
  const tokens = (await tokenRes.json()) as { access_token?: string };
  if (!tokens.access_token) throw badRequest('Google did not return an access token');

  const profileRes = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
    signal,
  });
  if (!profileRes.ok) throw badRequest('Could not read your Google profile');

  const p = (await profileRes.json()) as {
    sub?: string; email?: string; email_verified?: boolean; name?: string; picture?: string;
  };
  if (!p.sub || !p.email) throw badRequest('Google did not return an email address');

  // An unverified Google email must never be trusted to match an existing
  // account; doing so would let anyone claim a colleague's account.
  return {
    providerUserId: p.sub,
    email: p.email.toLowerCase(),
    emailVerified: p.email_verified === true,
    name: p.name?.slice(0, 80) || p.email.split('@')[0] || 'New user',
    picture: p.picture ?? null,
  };
}
