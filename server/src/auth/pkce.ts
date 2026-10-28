import { createHash, randomBytes } from "node:crypto";

export function base64Url(input: Buffer): string {
  return input.toString("base64url");
}

export function randomToken(byteLength = 32): string {
  return base64Url(randomBytes(byteLength));
}

/** RFC 7636 verifier: 43-128 characters from the unreserved set. */
export function createCodeVerifier(): string {
  return randomToken(32);
}

/** RFC 7636 S256 challenge: base64url(sha256(verifier)). */
export function createCodeChallenge(verifier: string): string {
  return base64Url(createHash("sha256").update(verifier).digest());
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
