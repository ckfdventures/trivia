import { describe, expect, it } from "vitest";
import { corsOrigin } from "../src/app.js";

/** Resolve the option the way the `cors` package would, so tests read as allow/deny. */
function allows(origins: string[], origin: string | undefined): boolean {
  const option = corsOrigin(origins);
  if (option === "*") return true;
  if (Array.isArray(option)) return origin !== undefined && option.includes(origin);
  if (typeof option === "function") {
    let allowed = false;
    // The cors package's callback takes a StaticOrigin, of which boolean is one form.
    option(origin, (_err, ok) => {
      allowed = ok === true;
    });
    return allowed;
  }
  return false;
}

describe("corsOrigin", () => {
  it("still lets * mean anything", () => {
    expect(corsOrigin(["*"])).toBe("*");
    expect(allows(["*"], "https://anywhere.example")).toBe(true);
  });

  it("matches an exact list exactly", () => {
    const list = ["https://app.example.com"];
    expect(allows(list, "https://app.example.com")).toBe(true);
    expect(allows(list, "https://other.example.com")).toBe(false);
  });

  it("matches preview hostnames through a wildcard", () => {
    const list = ["https://ckfd-trivia-*.vercel.app"];
    expect(allows(list, "https://ckfd-trivia-keh00zgna-ckfd.vercel.app")).toBe(true);
    expect(allows(list, "https://ckfd-trivia-git-some-branch-ckfd.vercel.app")).toBe(true);
  });

  it("keeps exact entries working alongside patterns", () => {
    const list = ["https://ckfd-trivia.vercel.app", "https://ckfd-trivia-*.vercel.app"];
    expect(allows(list, "https://ckfd-trivia.vercel.app")).toBe(true);
    expect(allows(list, "https://ckfd-trivia-abc123-ckfd.vercel.app")).toBe(true);
    expect(allows(list, "https://somethingelse.vercel.app")).toBe(false);
  });

  it("never lets a wildcard cross a dot", () => {
    const list = ["https://ckfd-trivia-*.vercel.app"];
    // The attack a naive `.*` would allow: a host the attacker controls, suffixed to look right.
    expect(allows(list, "https://ckfd-trivia-x.attacker.com")).toBe(false);
    expect(allows(list, "https://ckfd-trivia-x.evil.com.vercel.app")).toBe(false);
    expect(allows(list, "http://ckfd-trivia-x.vercel.app")).toBe(false);
  });

  it("allows a request that carries no Origin at all", () => {
    // curl, server-to-server, same-origin — not a cross-origin decision to make.
    expect(allows(["https://ckfd-trivia-*.vercel.app"], undefined)).toBe(true);
  });
});
