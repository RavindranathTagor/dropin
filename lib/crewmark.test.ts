import { describe, expect, it } from "vitest";
import { accessRoom, classifyEmail, tierAfterProof } from "@/lib/crewmark";

describe("crewmark", () => {
  it("keeps a gmail address at tier 1", () => {
    const gmail = classifyEmail("ada@gmail.com");
    expect(gmail.kind).toBe("personal");
    expect(gmail.badge).toBe("personal");
    expect(gmail.verifiedPeer).toBe(false);
    expect(tierAfterProof(gmail, true)).toBe(1);
    expect(tierAfterProof(gmail, false)).toBe(1);
  });

  it("classifies rvce.edu.in as academic", () => {
    const campus = classifyEmail("student@rvce.edu.in");
    expect(campus.kind).toBe("academic");
    expect(campus.organisation).toBe("RVCE");
    expect(campus.tier).toBe(2);
    expect(classifyEmail("me@cs.rvce.edu.in").organisation).toBe("RVCE");
  });

  it("rejects a tier 1 hold in a restricted room", () => {
    const decision = accessRoom(
      { trustTier: 1, badge: "personal", organisation: null, domain: "gmail.com" },
      { scope: "campus", organisation: "RVCE" },
    );
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.code).toBe("crewmark_tier1");
      expect(decision.message.toLowerCase()).not.toContain("mock");
    }
  });

  it("lets a verified peer of the same campus join", () => {
    const decision = accessRoom(
      { trustTier: 2, badge: "academic", organisation: "RVCE", domain: "rvce.edu.in" },
      { scope: "campus", organisation: "RVCE" },
    );
    expect(decision.ok).toBe(true);
  });

  it("names the demo organisation Dropin", () => {
    const demo = classifyEmail("passenger@ghardrop.dev");
    expect(demo.kind).toBe("corporate");
    expect(demo.organisation).toBe("Dropin");
  });
});
