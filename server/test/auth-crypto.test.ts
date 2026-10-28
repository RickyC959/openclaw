import { describe, expect, it } from "vitest";
import { createCodeChallenge, createCodeVerifier } from "../src/auth/pkce.js";
import { decodeFlowState, encodeFlowState } from "../src/auth/state.js";

describe("PKCE", () => {
  it("matches the RFC 7636 Appendix B test vector", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const expected = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
    expect(createCodeChallenge(verifier)).toBe(expected);
  });

  it("generates verifiers in the allowed character set", () => {
    const verifier = createCodeVerifier();
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/);
  });

  it("generates a different verifier each time", () => {
    expect(createCodeVerifier()).not.toBe(createCodeVerifier());
  });
});

describe("OIDC flow state", () => {
  const secret = "state-secret-for-tests";
  const input = { state: "s1", verifier: "v1", nonce: "n1" };

  it("round-trips a valid state", () => {
    const { value } = encodeFlowState(input, secret);
    const decoded = decodeFlowState(value, secret);
    expect(decoded?.state).toBe("s1");
    expect(decoded?.verifier).toBe("v1");
    expect(decoded?.nonce).toBe("n1");
  });

  it("rejects a tampered payload", () => {
    const { value } = encodeFlowState(input, secret);
    const [, signature] = value.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ ...input, verifier: "attacker", expiresAt: Date.now() + 1000 }),
    ).toString("base64url");
    expect(decodeFlowState(`${forgedPayload}.${signature}`, secret)).toBeNull();
  });

  it("rejects a state signed with another secret", () => {
    const { value } = encodeFlowState(input, secret);
    expect(decodeFlowState(value, "different-secret")).toBeNull();
  });

  it("rejects an expired state", () => {
    const { value } = encodeFlowState(input, secret, Date.now() - 11 * 60 * 1000);
    expect(decodeFlowState(value, secret)).toBeNull();
  });

  it("rejects garbage", () => {
    expect(decodeFlowState("not-a-cookie", secret)).toBeNull();
    expect(decodeFlowState(undefined, secret)).toBeNull();
  });
});
