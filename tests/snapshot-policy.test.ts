import { describe, expect, it } from "vitest";
import {
  createIdentityVerifier,
  maskAccountIdentity,
} from "../src/main/providers/snapshot-policy";

describe("account identity masking", () => {
  it("returns a bounded masked value for ordinary provider identities", () => {
    expect(maskAccountIdentity("developer@example.com")).toBe(
      "d***@example.com",
    );
    expect(maskAccountIdentity("account-1234")).toBe("ac***4");
  });

  it("keeps display masks private while using collision-resistant verification", () => {
    const key = Buffer.alloc(32, 7);
    expect(maskAccountIdentity("alice@example.com")).toBe(
      maskAccountIdentity("adam@example.com"),
    );
    expect(createIdentityVerifier("alice@example.com", key)).not.toBe(
      createIdentityVerifier("adam@example.com", key),
    );
    expect(createIdentityVerifier("Alice@example.com", key)).toBe(
      createIdentityVerifier("alice@example.com", key),
    );
  });

  it("rejects control characters and oversized provider output", () => {
    expect(maskAccountIdentity("safe@example.com\nforged")).toBeNull();
    expect(maskAccountIdentity(`${"a".repeat(250)}@example.com`)).toBeNull();
  });
});
