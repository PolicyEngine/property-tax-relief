import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ProgramDetail } from "../components/ProgramDetail";
import { Explorer } from "../components/Explorer";
import { Calculator } from "../components/Calculator";
import { inventoryCsv, PAYMENT_MECHANISM_LABELS } from "../lib/inventory";
import type { PaymentMechanism, StateProfile } from "../lib/types";

// Display fixtures condition on recorded metadata; no household amounts are computed.
const original = JSON.parse(
  readFileSync("data/states/MA.json", "utf8"),
) as StateProfile;
const mechanisms = Object.keys(PAYMENT_MECHANISM_LABELS) as PaymentMechanism[];
const cases = mechanisms.flatMap((mechanism) =>
  [true, false, null].map((flag) => ({ mechanism, flag })),
);

describe("calculator interactive readiness", () => {
  it("keeps the server-rendered state picker disabled until client listeners mount", () => {
    // https://playwright.dev/docs/navigations#hydration
    const html = renderToStaticMarkup(
      createElement(Calculator, {
        programs: [],
        states: [{ code: "TX", name: "Texas" }],
      }),
    );
    const statePicker = html.match(
      /<select\b[^>]*\bid="calculator-state"[^>]*>/,
    )?.[0];
    expect(statePicker).toBeDefined();
    expect(statePicker).toContain('disabled=""');
    expect(html).not.toContain('id="calculator-program"');
  });
});

function fixture(mechanism: PaymentMechanism, flag: boolean | null) {
  const state = structuredClone(original);
  state.programs = [
    {
      ...state.programs[0],
      name: "Display fixture",
      tenures: ["owner"],
      paymentMechanism: mechanism,
      refundable: flag,
    },
  ];
  return state;
}

describe("payment mechanism and recorded refundability", () => {
  it.each(cases)(
    "renders and exports $mechanism / $flag",
    ({ mechanism, flag }) => {
      const state = fixture(mechanism, flag);
      const program = state.programs[0];
      const html = renderToStaticMarkup(
        createElement(ProgramDetail, { program }),
      );
      expect(html).toContain(PAYMENT_MECHANISM_LABELS[mechanism]);
      const carriesFlag =
        mechanism === "income-tax-credit" || mechanism === "not-established";
      const expectedCsv = carriesFlag && flag !== null ? String(flag) : "";
      expect(inventoryCsv([state])).toContain(
        `"owner","${expectedCsv}","${mechanism}"`,
      );
      if (flag !== null && carriesFlag) {
        expect(html).toContain(
          mechanism === "income-tax-credit"
            ? "Income-tax credit refundability"
            : "Recorded refundability",
        );
        if (mechanism === "income-tax-credit")
          expect(html).toContain(
            flag ? "Refundable" : "Limited to income-tax liability",
          );
        else {
          expect(html).toContain(
            flag
              ? "Refundable; payment mechanism not established"
              : "Nonrefundable; payment mechanism not established",
          );
          expect(html).not.toContain("Limited to income-tax liability");
        }
      } else {
        expect(html).not.toContain("<dt>Recorded refundability</dt>");
        expect(html).not.toContain("<dt>Income-tax credit refundability</dt>");
      }
      expect(program.refundable).toBe(flag);
    },
  );

  it("carries mechanism and recorded refundability into the actual three-state comparison", () => {
    const state = fixture("not-established", false);
    const html = renderToStaticMarkup(
      createElement(Explorer, { states: [state], coverage: null }),
    );
    const comparison = html.slice(html.indexOf('id="compare"'));
    expect(comparison).toContain("<dt>Payment mechanism</dt>");
    expect(comparison).toContain("<dt>Recorded refundability</dt>");
    expect(comparison).toContain(
      "Nonrefundable; payment mechanism not established",
    );
    expect(comparison).not.toContain("Limited to income-tax liability");
  });
});
