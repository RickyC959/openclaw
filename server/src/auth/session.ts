import type { Db } from "../db/index.js";
import { randomToken, sha256Hex } from "./pkce.js";

export interface Account {
  id: string;
  institution_id: string;
  email: string;
  full_name: string | null;
  role: "member" | "officer" | "admin";
}

export interface Institution {
  id: string;
  slug: string;
  name: string;
  domain: string;
}

export interface SessionRecord {
  token: string;
  expiresAt: Date;
}

export interface SessionContext {
  account: Account;
  institution: Institution;
  token: string;
}

/**
 * Creates an opaque session token. Only its hash is stored, so a database dump
 * does not hand an attacker usable sessions.
 */
export async function createSession(
  db: Db,
  accountId: string,
  meta: { userAgent?: string | undefined; ip?: string | undefined },
  ttlMs: number,
  now = new Date(),
): Promise<SessionRecord> {
  const token = randomToken(32);
  const expiresAt = new Date(now.getTime() + ttlMs);

  await db.query(
    `INSERT INTO session (account_id, token_hash, expires_at, user_agent, ip)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      accountId,
      sha256Hex(token),
      expiresAt.toISOString(),
      meta.userAgent ?? null,
      meta.ip ?? null,
    ],
  );

  return { token, expiresAt };
}

/** Returns the session context, or null if unknown, expired, or revoked. */
export async function getSession(
  db: Db,
  token: string,
  now = new Date(),
): Promise<SessionContext | null> {
  const rows = await db.query<{
    token: string;
    expires_at: string;
    account_id: string;
    institution_id: string;
    email: string;
    full_name: string | null;
    role: "member" | "officer" | "admin";
    slug: string;
    name: string;
    domain: string;
  }>(
    `SELECT s.token_hash AS token,
            s.expires_at,
            a.id AS account_id, a.institution_id, a.email, a.full_name, a.role,
            i.slug, i.name, i.domain
       FROM session s
       JOIN account a ON a.id = s.account_id
       JOIN institution i ON i.id = a.institution_id
      WHERE s.token_hash = $1
        AND s.expires_at > $2`,
    [sha256Hex(token), now.toISOString()],
  );

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    token,
    account: {
      id: row.account_id,
      institution_id: row.institution_id,
      email: row.email,
      full_name: row.full_name,
      role: row.role,
    },
    institution: {
      id: row.institution_id,
      slug: row.slug,
      name: row.name,
      domain: row.domain,
    },
  };
}

export async function destroySession(db: Db, token: string): Promise<void> {
  await db.query("DELETE FROM session WHERE token_hash = $1", [
    sha256Hex(token),
  ]);
}

/** Used after a role change or on "sign out everywhere". */
export async function destroyAllSessions(
  db: Db,
  accountId: string,
): Promise<void> {
  await db.query("DELETE FROM session WHERE account_id = $1", [accountId]);
}

/** Housekeeping: remove expired rows. Safe to call on a schedule. */
export async function purgeExpiredSessions(
  db: Db,
  now = new Date(),
): Promise<void> {
  await db.query("DELETE FROM session WHERE expires_at <= $1", [
    now.toISOString(),
  ]);
}
