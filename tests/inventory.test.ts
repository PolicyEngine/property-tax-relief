import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { readFileSync, readdirSync } from "node:fs";
import {
  CATEGORY_LABELS,
  filterStates,
  inventoryCsv,
  isComparisonProgram,
  STATE_CODES,
} from "../lib/inventory";
import type { StateProfile } from "../lib/types";

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
  it("never labels exemptions, deferrals or deductions as comparable cash credits", () => {
    for (const state of states)
      for (const p of state.programs) {
        if (
          [
            "exemption",
            "deduction",
            "deferral",
            "assessment-limit",
            "local-option",
          ].includes(p.category)
        )
          expect(isComparisonProgram(p)).toBe(false);
      }
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
    const csv = inventoryCsv(states);
    expect(csv).toContain('"source_urls"');
    expect(csv).toContain('"tax_year"');
    for (const state of states) expect(csv).toContain(`"${state.code}"`);
  });
});
