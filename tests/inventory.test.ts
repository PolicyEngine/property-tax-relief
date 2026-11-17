import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { readFileSync, readdirSync } from "node:fs";
import {
  CATEGORY_LABELS,
  displayedRefundability,
  PAYMENT_MECHANISM_LABELS,
  filterStates,
  inventoryCsv,
  isComparisonProgram,
  STATE_CODES,
  selectPrograms,
} from "../lib/inventory";
import type { StateProfile } from "../lib/types";
import { canonicalCommitLabel } from "../lib/loadResearch";

const states = readdirSync("data/states")
  .filter((f) => f.endsWith(".json"))
  .map(
    (f) => JSON.parse(readFileSync(`data/states/${f}`, "utf8")) as StateProfile,
  );

describe("national source inventory", () => {
  it("contains exactly all 50 states and DC", () => {
    expect(states.map((s) => s.code).sort()).toEqual([...STATE_CODES].sort());
  });
  it("records official sources and consistent comparison years", () => {
    for (const state of states) {
      expect(state.taxYear).toBe(2025);
      expect(state.sources.length, state.code).toBeGreaterThan(0);
      expect(state.overview.length).toBeGreaterThan(15);
      for (const p of state.programs) {
        expect(Object.keys(CATEGORY_LABELS)).toContain(p.category);
        expect(Object.keys(PAYMENT_MECHANISM_LABELS)).toContain(
          p.paymentMechanism,
        );
        expect(p.sources.length, p.id).toBeGreaterThan(0);
        expect(p.programYear.trim().length, p.id).toBeGreaterThanOrEqual(4);
        if (isComparisonProgram(p))
          expect(p.programYear, p.id).toMatch(/20\d{2}/);
        expect(p.tenures.every((t) => ["owner", "renter"].includes(t))).toBe(
          true,
        );
        for (const source of p.sources)
          expect(new URL(source.url).protocol).toBe("https:");
        if (p.rentProxy !== null) expect(p.rentProxy).toBeGreaterThan(0);
        if (p.rentProxy !== null) expect(p.rentProxy).toBeLessThanOrEqual(1);
      }
    }
  });
  it("keeps exemptions, deferrals and limits outside the tax-program comparison", () => {
    for (const state of states)
      for (const p of state.programs) {
        if (
          [
            "exemption",
            "deferral",
            "assessment-limit",
            "local-option",
          ].includes(p.category)
        )
          expect(isComparisonProgram(p)).toBe(false);
      }
  });
  it("shows the Massachusetts rental deduction without enabling property-tax context", () => {
    const massachusetts = states.find((state) => state.code === "MA")!;
    expect(
      selectPrograms(massachusetts, "renter", "deduction", false).map(
        (p) => p.id,
      ),
    ).toContain("ma-renters-income-tax-deduction");
  });
  it("keeps filtering deterministic and within the inventory for every query", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.constantFrom("all", "owner", "renter"),
        (query, tenure) => {
          const first = filterStates(
            states,
            query,
            tenure as "all" | "owner" | "renter",
            "all",
            false,
          );
          expect(first).toEqual(
            filterStates(
              states,
              query,
              tenure as "all" | "owner" | "renter",
              "all",
              false,
            ),
          );
          expect(first.every((s) => states.includes(s))).toBe(true);
          expect(new Set(first.map((s) => s.code)).size).toBe(first.length);
        },
      ),
    );
  });
  it("exports source and year columns and quotes multiline content", () => {
    const nationalCsv = inventoryCsv(states);
    for (const state of states)
      expect(nationalCsv).toContain(`"${state.code}"`);
    const fixture = structuredClone(states[0]);
    fixture.programs[0].name = 'Quote,\n"line"';
    fixture.programs[0].refundable = false;
    fixture.programs[0].paymentMechanism = "property-tax-bill-reduction";
    const csv = inventoryCsv([fixture]);
    expect(csv).toContain('"source_urls"');
    expect(csv).toContain('"tax_year"');
    expect(csv).toContain('"program_id"');
    expect(csv).toContain(`"${fixture.programs[0].id}"`);
    expect(csv).toContain('"payment_mechanism"');
    expect(csv).toContain('"state_research_notes"');
    expect(csv).toContain('"property-tax-bill-reduction"');
    expect(csv).not.toContain('"false"');
    expect(csv).toContain('"Quote,\n""line"""');
    expect(csv).toContain("\r\n");
  });
  it("retains unclassified refundability without calling bill reductions income-tax credits", () => {
    const program = structuredClone(states[0].programs[0]);
    program.paymentMechanism = "income-tax-credit";
    program.refundable = false;
    expect(displayedRefundability(program)).toBe(false);
    program.paymentMechanism = "not-established";
    program.refundable = true;
    expect(displayedRefundability(program)).toBe(true);
    program.paymentMechanism = "property-tax-bill-reduction";
    expect(displayedRefundability(program)).toBeNull();
    program.paymentMechanism = "cash-rebate";
    expect(displayedRefundability(program)).toBeNull();
  });
  it.each(["=x", "+x", "-x", "@x", "\tx", "\rx", "  =x"])(
    "guards spreadsheet-leading content %j",
    (value) => {
      const fixture = structuredClone(states[0]);
      fixture.programs[0].name = value;
      expect(inventoryCsv([fixture])).toContain(`"'${value}"`);
    },
  );
  it("preserves the not-inspected sentinel and abbreviates only actual commit IDs", () => {
    expect(canonicalCommitLabel("not-inspected")).toBe("not-inspected");
    expect(
      canonicalCommitLabel("62b668978ccdb79cf4dd8ac88816e7de54e96209"),
    ).toBe("62b668978ccd");
    expect(canonicalCommitLabel("unknown-source-version")).toBe(
      "unknown-source-version",
    );
  });
});
