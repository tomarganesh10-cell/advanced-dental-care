import { describe, expect, it } from "vitest";
import clinicMasterData, { statistics, technology } from "@data/clinic-master-data";
import {
  flattenClaims,
  isPublishable,
  publicValue,
  publishableList,
  unverified,
  verified,
} from "@data/verification";

describe("verified claims", () => {
  /**
   * These tests exist because of a specific failure on the previous site: it
   * published "25 years" and "18 years" of experience, and "20,000" and "5,000"
   * patients, on the same site. The whole mechanism is designed so that cannot
   * recur, and these assertions are what keep it that way.
   */
  it("hides an unverified value from the public site", () => {
    const claim = unverified(20000, { source: "old site" });
    expect(publicValue(claim)).toBeUndefined();
    expect(isPublishable(claim)).toBe(false);
  });

  it("exposes a verified value", () => {
    const claim = verified(20000, {
      source: "practice management export",
      verifiedBy: "clinic manager",
      verifiedOn: "2026-03-11",
      evidence: "Patient count report, 11 Mar 2026",
    });
    expect(publicValue(claim)).toBe(20000);
    expect(isPublishable(claim)).toBe(true);
  });

  it("hides an archived value", () => {
    const claim = { ...verified(1, { source: "s", verifiedBy: "b", verifiedOn: "d", evidence: "e" }) };
    claim.status = "ARCHIVED";
    expect(publicValue(claim)).toBeUndefined();
  });

  it("returns undefined for a missing claim rather than throwing", () => {
    expect(publicValue(undefined)).toBeUndefined();
    expect(isPublishable(undefined)).toBe(false);
  });

  it("filters a list down to publishable entries", () => {
    const list = [
      verified("a", { source: "s", verifiedBy: "b", verifiedOn: "d", evidence: "e" }),
      unverified("b", { source: "s" }),
      verified("c", { source: "s", verifiedBy: "b", verifiedOn: "d", evidence: "e" }),
    ];
    expect(publishableList(list)).toEqual(["a", "c"]);
  });

  describe("the master data ships safe by default", () => {
    it("keeps the disputed experience and patient figures unpublished", () => {
      expect(publicValue(statistics.patientsTreated)).toBeUndefined();
      expect(publicValue(statistics.clinicFoundedYear)).toBeUndefined();
      expect(publicValue(statistics.doctorPractisingSinceYear)).toBeUndefined();
    });

    it("keeps every technology claim unpublished until evidence exists", () => {
      // CBCT in particular needs a current AERB licence, not just an invoice.
      for (const claim of technology) {
        expect(isPublishable(claim), `${claim.value.slug} should not be published yet`).toBe(false);
      }
    });

    it("finds every claim in the tree", () => {
      const claims = flattenClaims(clinicMasterData);
      expect(claims.length).toBeGreaterThan(10);

      const keys = claims.map((claim) => claim.key);
      expect(keys).toContain("statistics.patientsTreated");
      expect(keys).toContain("openingHours");
      expect(keys).toContain("contact.geo");
    });

    it("never marks a claim VERIFIED without naming the evidence", () => {
      for (const claim of flattenClaims(clinicMasterData)) {
        if (claim.status === "VERIFIED") {
          expect(claim.evidence, `${claim.key} is verified with no evidence`).toBeTruthy();
          expect(claim.verifiedBy, `${claim.key} is verified by nobody`).toBeTruthy();
          expect(claim.verifiedOn, `${claim.key} is verified with no date`).toBeTruthy();
        }
      }
    });
  });
});
