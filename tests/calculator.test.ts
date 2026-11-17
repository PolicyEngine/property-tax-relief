import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import type { CalculatorProgram, CalculatorValues } from "../lib/calculator";

// These are transport fixtures, not statutory benefit examples or model outputs.
const TRANSPORT_PROGRAM: CalculatorProgram = {
  id: "transport-fixture",
  state: "IN",
  name: "Transport fixture",
  modelVariable: "in_renters_deduction",
  entity: "tax_unit",
  kind: "deduction",
  inputs: [
    {
      variable: "age",
      label: "Age",
      entity: "person",
      kind: "number",
      minimum: 0,
      maximum: 120,
    },
    {
      variable: "rent",
      label: "Annual rent",
      entity: "person",
      kind: "money",
      minimum: 0,
    },
    {
      variable: "is_disabled",
      label: "Disability",
      entity: "person",
      kind: "boolean",
    },
    {
      variable: "tenure_type",
      label: "Tenure",
      entity: "household",
      kind: "select",
      options: [{ value: "RENTED", label: "Rented" }],
    },
  ],
  notes: [],
  unavailableReason: null,
  sources: [],
};

const TRANSPORT_VALUES: CalculatorValues = {
  age: "40",
  rent: "12000",
  is_disabled: "false",
  tenure_type: "RENTED",
};

function fixtureResult(value: unknown) {
  return {
    tax_units: {
      tax_unit: { in_renters_deduction: { 2025: value } },
    },
  };
}

function transportAnswer(value: unknown = 123.45) {
  return new Response(
    JSON.stringify({
      status: "ok",
      message: null,
      result: fixtureResult(value),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

let adapter: typeof import("../lib/calculator");
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
const originalAny = Object.getOwnPropertyDescriptor(AbortSignal, "any")!;

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-15T12:00:00Z"));
  fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => transportAnswer());
  vi.stubGlobal("fetch", fetchMock);
  adapter = await import("../lib/calculator");
});

afterEach(() => {
  Object.defineProperty(AbortSignal, "any", originalAny);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("household input transport", () => {
  it("builds one single claimant across all six entities, with the selected state and requested output", () => {
    const household = adapter.buildHousehold(
      TRANSPORT_PROGRAM,
      TRANSPORT_VALUES,
    );
    expect(Object.keys(household).sort()).toEqual(
      [
        "people",
        "families",
        "marital_units",
        "tax_units",
        "spm_units",
        "households",
      ].sort(),
    );
    expect(Object.keys(household.people)).toEqual(["claimant"]);
    expect(household.people.claimant).toEqual({
      age: { 2025: 40 },
      rent: { 2025: 12000 },
      is_disabled: { 2025: false },
      is_tax_unit_head: { 2025: true },
      is_tax_unit_spouse: { 2025: false },
      is_tax_unit_dependent: { 2025: false },
    });
    for (const [plural, members] of Object.entries(household)) {
      if (plural === "people") continue;
      expect(Object.values(members)).toHaveLength(1);
      expect(Object.values(members)[0].members).toEqual(["claimant"]);
    }
    expect(household.households.household.state_code).toEqual({ 2025: "IN" });
    expect(household.households.household.tenure_type).toEqual({
      2025: "RENTED",
    });
    expect(household.tax_units.tax_unit.filing_status).toEqual({
      2025: "SINGLE",
    });
    expect(household.tax_units.tax_unit.in_renters_deduction).toEqual({
      2025: null,
    });
    expect(household.people.claimant.in_renters_deduction).toBeUndefined();
  });

  it("uses a program's prior-year input period while requesting its 2025 output", () => {
    const program = {
      ...TRANSPORT_PROGRAM,
      inputs: [{ ...TRANSPORT_PROGRAM.inputs[0], period: 2024 }],
    };
    const household = adapter.buildHousehold(program, TRANSPORT_VALUES);
    expect(household.people.claimant.age).toEqual({ 2024: 40 });
    expect(household.tax_units.tax_unit.in_renters_deduction).toEqual({
      2025: null,
    });
  });

  it("preserves explicit zero and false rather than treating them as missing", () => {
    const values = {
      ...TRANSPORT_VALUES,
      age: "0",
      rent: "0",
      is_disabled: "false",
    };
    expect(adapter.validateInputs(TRANSPORT_PROGRAM, values)).toEqual([]);
    const household = adapter.buildHousehold(TRANSPORT_PROGRAM, values);
    expect(household.people.claimant.age).toEqual({ 2025: 0 });
    expect(household.people.claimant.rent).toEqual({ 2025: 0 });
    expect(household.people.claimant.is_disabled).toEqual({ 2025: false });
  });

  it.each(["", " ", "0x10", "Infinity", "NaN", "1e4", "-1", "12,000"])(
    "rejects missing or invalid annual rent %j before constructing a request",
    (rent) => {
      const values = { ...TRANSPORT_VALUES, rent };
      expect(adapter.validateInputs(TRANSPORT_PROGRAM, values)).toContain(
        "rent",
      );
      expect(() => adapter.buildHousehold(TRANSPORT_PROGRAM, values)).toThrow(
        "incomplete-inputs",
      );
    },
  );

  it("rejects omitted inputs, invalid enum and boolean values, and out-of-range age", () => {
    expect(adapter.validateInputs(TRANSPORT_PROGRAM, {})).toEqual([
      "age",
      "rent",
      "is_disabled",
      "tenure_type",
    ]);
    expect(
      adapter.validateInputs(TRANSPORT_PROGRAM, {
        ...TRANSPORT_VALUES,
        age: "121",
        is_disabled: "0",
        tenure_type: "UNKNOWN",
      }),
    ).toEqual(["age", "is_disabled", "tenure_type"]);
  });

  it("does not mutate user-entered values or the reviewed program contract", () => {
    const before = JSON.stringify({
      program: TRANSPORT_PROGRAM,
      values: TRANSPORT_VALUES,
    });
    adapter.buildHousehold(TRANSPORT_PROGRAM, TRANSPORT_VALUES);
    expect(
      JSON.stringify({ program: TRANSPORT_PROGRAM, values: TRANSPORT_VALUES }),
    ).toBe(before);
  });
});

describe("calculation result integrity", () => {
  it.each([
    undefined,
    null,
    "0",
    "123.45",
    [],
    [0],
    {},
    true,
    Infinity,
    -Infinity,
    NaN,
  ])("never converts unavailable or invalid output %j into a zero", (value) => {
    expect(() =>
      adapter.readModelResult(TRANSPORT_PROGRAM, fixtureResult(value)),
    ).toThrow("invalid-model-result");
  });

  it.each([
    undefined,
    null,
    {},
    { tax_units: {} },
    { people: { claimant: {} } },
  ])("rejects a missing result path %j", (result) => {
    expect(() => adapter.readModelResult(TRANSPORT_PROGRAM, result)).toThrow(
      "invalid-model-result",
    );
  });

  it("preserves an actual finite engine zero", () => {
    expect(
      adapter.readModelResult(TRANSPORT_PROGRAM, fixtureResult(0)),
    ).toEqual({
      value: 0,
      modelVariable: "in_renters_deduction",
      calculatedAt: "2026-11-15T12:00:00.000Z",
    });
  });

  it("preserves every finite returned amount exactly, without applying a tax rate or other benefit arithmetic", () => {
    fc.assert(
      fc.property(
        fc.double({ noNaN: true, noDefaultInfinity: true }),
        (transportValue) => {
          const result = adapter.readModelResult(
            TRANSPORT_PROGRAM,
            fixtureResult(transportValue),
          );
          expect(Object.is(result.value, transportValue)).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("rejects a value for the wrong year rather than borrowing it", () => {
    expect(() =>
      adapter.readModelResult(TRANSPORT_PROGRAM, {
        tax_units: { tax_unit: { in_renters_deduction: { 2024: 123.45 } } },
      }),
    ).toThrow("invalid-model-result");
  });
});

describe("official dashboard API transport", () => {
  it("uses the official client and dashboard route with the complete household, without cookies or policy arithmetic", async () => {
    await expect(
      adapter.calculateProgram(TRANSPORT_PROGRAM, TRANSPORT_VALUES),
    ).resolves.toMatchObject({
      value: 123.45,
      modelVariable: "in_renters_deduction",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://www.policyengine.org/api/household/calculate");
    expect(options).toMatchObject({ method: "POST", credentials: "omit" });
    expect(JSON.parse(options?.body as string)).toEqual({
      country: "us",
      household: adapter.buildHousehold(TRANSPORT_PROGRAM, TRANSPORT_VALUES),
    });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it("never calls the API for unavailable programs or invalid inputs", async () => {
    for (const program of [
      { ...TRANSPORT_PROGRAM, modelVariable: null },
      { ...TRANSPORT_PROGRAM, entity: null },
      { ...TRANSPORT_PROGRAM, unavailableReason: "Missing reviewed coverage" },
      { ...TRANSPORT_PROGRAM, entity: "unknown_entity" },
    ]) {
      await expect(
        adapter.calculateProgram(program, TRANSPORT_VALUES),
      ).rejects.toThrow("unsupported-program");
    }
    await expect(
      adapter.calculateProgram(TRANSPORT_PROGRAM, {}),
    ).rejects.toThrow("incomplete-inputs");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reuses an unchanged request and keeps the original calculation timestamp", async () => {
    const first = await adapter.calculateProgram(
      TRANSPORT_PROGRAM,
      TRANSPORT_VALUES,
    );
    vi.advanceTimersByTime(10_000);
    const repeated = await adapter.calculateProgram(
      TRANSPORT_PROGRAM,
      TRANSPORT_VALUES,
    );
    expect(repeated).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not reuse a cached answer after the selected state or input changes", async () => {
    await adapter.calculateProgram(TRANSPORT_PROGRAM, TRANSPORT_VALUES);
    await adapter.calculateProgram(TRANSPORT_PROGRAM, {
      ...TRANSPORT_VALUES,
      rent: "12001",
    });
    await adapter.calculateProgram(
      { ...TRANSPORT_PROGRAM, state: "CA" },
      TRANSPORT_VALUES,
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not cache an invalid result as an amount", async () => {
    fetchMock.mockResolvedValueOnce(transportAnswer(null));
    await expect(
      adapter.calculateProgram(TRANSPORT_PROGRAM, TRANSPORT_VALUES),
    ).rejects.toThrow("invalid-model-result");
    await expect(
      adapter.calculateProgram(TRANSPORT_PROGRAM, TRANSPORT_VALUES),
    ).resolves.toMatchObject({ value: 123.45 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("enforces fifteen distinct calculation requests per rolling minute", async () => {
    for (let i = 0; i < 15; i++) {
      await adapter.calculateProgram(TRANSPORT_PROGRAM, {
        ...TRANSPORT_VALUES,
        rent: String(i),
      });
    }
    await expect(
      adapter.calculateProgram(TRANSPORT_PROGRAM, {
        ...TRANSPORT_VALUES,
        rent: "16",
      }),
    ).rejects.toThrow("rate-limit");
    expect(fetchMock).toHaveBeenCalledTimes(15);
    vi.advanceTimersByTime(59_999);
    await expect(
      adapter.calculateProgram(TRANSPORT_PROGRAM, {
        ...TRANSPORT_VALUES,
        rent: "16",
      }),
    ).rejects.toThrow("rate-limit");
    vi.advanceTimersByTime(1);
    await adapter.calculateProgram(TRANSPORT_PROGRAM, {
      ...TRANSPORT_VALUES,
      rent: "16",
    });
    expect(fetchMock).toHaveBeenCalledTimes(16);
  });

  it("bounds its in-memory cache to twenty distinct successful requests", async () => {
    for (let i = 0; i < 21; i++) {
      if (i === 15) vi.advanceTimersByTime(60_000);
      await adapter.calculateProgram(TRANSPORT_PROGRAM, {
        ...TRANSPORT_VALUES,
        rent: String(i),
      });
    }
    await adapter.calculateProgram(TRANSPORT_PROGRAM, {
      ...TRANSPORT_VALUES,
      rent: "1",
    });
    expect(fetchMock).toHaveBeenCalledTimes(21);
    await adapter.calculateProgram(TRANSPORT_PROGRAM, {
      ...TRANSPORT_VALUES,
      rent: "0",
    });
    expect(fetchMock).toHaveBeenCalledTimes(22);
  });

  it.each([undefined, "0", "30", "120"])(
    "waits at least a minute after HTTP 429, respecting a longer Retry-After %j",
    async (retryAfter) => {
      fetchMock.mockResolvedValueOnce(
        new Response("Too many requests", {
          status: 429,
          headers:
            retryAfter === undefined ? {} : { "Retry-After": retryAfter },
        }),
      );
      await expect(
        adapter.calculateProgram(TRANSPORT_PROGRAM, TRANSPORT_VALUES),
      ).rejects.toThrow("rate-limit");
      const delay = Math.max(60, Number(retryAfter) || 0) * 1000;
      vi.advanceTimersByTime(delay - 1);
      await expect(
        adapter.calculateProgram(TRANSPORT_PROGRAM, TRANSPORT_VALUES),
      ).rejects.toThrow("rate-limit");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1);
      await adapter.calculateProgram(TRANSPORT_PROGRAM, TRANSPORT_VALUES);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

  it("classifies network failure and prevents immediate repeated requests", async () => {
    fetchMock.mockRejectedValueOnce(
      new TypeError("Transport fixture network failure"),
    );
    await expect(
      adapter.calculateProgram(TRANSPORT_PROGRAM, TRANSPORT_VALUES),
    ).rejects.toThrow("network");
    await expect(
      adapter.calculateProgram(TRANSPORT_PROGRAM, TRANSPORT_VALUES),
    ).rejects.toThrow("rate-limit");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    await adapter.calculateProgram(TRANSPORT_PROGRAM, TRANSPORT_VALUES);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([400, 401, 403, 500, 502, 503, 504])(
    "classifies HTTP %i as service unavailable, without automatic retries",
    async (status) => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "error",
            message: "Transport fixture service error",
            result: null,
          }),
          { status, headers: { "Content-Type": "application/json" } },
        ),
      );
      await expect(
        adapter.calculateProgram(TRANSPORT_PROGRAM, TRANSPORT_VALUES),
      ).rejects.toThrow("service-unavailable");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("refuses an already-cancelled action before making a request", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      adapter.calculateProgram(
        TRANSPORT_PROGRAM,
        TRANSPORT_VALUES,
        controller.signal,
      ),
    ).rejects.toThrow("cancelled");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("propagates cancellation while a calculation is in flight and does not cache it", async () => {
    fetchMock.mockImplementationOnce(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            "abort",
            () => reject(options.signal?.reason),
            { once: true },
          );
        }),
    );
    const controller = new AbortController();
    const pending = adapter.calculateProgram(
      TRANSPORT_PROGRAM,
      TRANSPORT_VALUES,
      controller.signal,
    );
    const rejected = expect(pending).rejects.toThrow("cancelled");
    controller.abort();
    await rejected;
    await adapter.calculateProgram(TRANSPORT_PROGRAM, TRANSPORT_VALUES);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("times out a stalled request at its deadline without retrying", async () => {
    vi.spyOn(AbortSignal, "timeout").mockImplementation((milliseconds) => {
      const controller = new AbortController();
      setTimeout(
        () => controller.abort(new DOMException("Timed out", "TimeoutError")),
        milliseconds,
      );
      return controller.signal;
    });
    fetchMock.mockImplementationOnce(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            "abort",
            () => reject(options.signal?.reason),
            { once: true },
          );
        }),
    );
    const pending = adapter.calculateProgram(
      TRANSPORT_PROGRAM,
      TRANSPORT_VALUES,
    );
    const rejected = expect(pending).rejects.toThrow("timeout");
    await vi.advanceTimersByTimeAsync(119_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await rejected;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("calculation cancellation without AbortSignal.any", () => {
  it.each(["success", "rejection", "cancel", "timeout"] as const)(
    "preserves %s behavior and removes fallback listeners",
    async (outcome) => {
      Object.defineProperty(AbortSignal, "any", {
        ...originalAny,
        value: undefined,
      });
      const timeout = new AbortController();
      vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeout.signal);
      const action = new AbortController();
      const removeAction = vi.spyOn(action.signal, "removeEventListener");
      const removeTimeout = vi.spyOn(timeout.signal, "removeEventListener");
      let resolve!: (response: Response) => void;
      let reject!: (reason: unknown) => void;
      fetchMock.mockImplementationOnce(
        (_url, options) =>
          new Promise((accept, refuse) => {
            resolve = accept;
            reject = refuse;
            options?.signal?.addEventListener(
              "abort",
              () => refuse(options.signal?.reason),
              { once: true },
            );
          }),
      );
      const pending = adapter.calculateProgram(
        TRANSPORT_PROGRAM,
        TRANSPORT_VALUES,
        action.signal,
      );
      if (outcome === "success") {
        resolve(transportAnswer());
        await expect(pending).resolves.toMatchObject({ value: 123.45 });
      } else {
        const rejected = expect(pending).rejects.toThrow(
          outcome === "cancel"
            ? "cancelled"
            : outcome === "timeout"
              ? "timeout"
              : "network",
        );
        if (outcome === "cancel") action.abort();
        else if (outcome === "timeout")
          timeout.abort(new DOMException("Timed out", "TimeoutError"));
        else reject(new TypeError("Transport fixture network failure"));
        await rejected;
      }
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(removeAction).toHaveBeenCalledWith("abort", expect.any(Function));
      expect(removeTimeout).toHaveBeenCalledWith("abort", expect.any(Function));
    },
  );
});

describe("calculator field messages", () => {
  it.each(["1e4", "0x10", "Infinity", "NaN", "12,000"])(
    "explains unsupported numeric notation %j before a request",
    (value) => {
      expect(
        adapter.calculatorInputError(TRANSPORT_PROGRAM.inputs[1], value),
      ).toBe("Annual rent: enter a plain decimal number.");
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each(["0", "1000.50", ".50", " 12. "])(
    "accepts the request parser's plain decimal input %j",
    (value) => {
      expect(
        adapter.calculatorInputError(TRANSPORT_PROGRAM.inputs[1], value),
      ).toBeNull();
    },
  );

  it.each(["-1", "1"])(
    "explains the exact-zero renter requirement for %j",
    (value) => {
      expect(
        adapter.calculatorInputError(
          {
            ...TRANSPORT_PROGRAM.inputs[1],
            minimum: 0,
            maximum: 0,
          },
          value,
        ),
      ).toBe("Annual rent: enter 0 in this renter scenario.");
    },
  );

  it("accepts an explicit zero for a fixed-zero field", () => {
    expect(
      adapter.calculatorInputError(
        {
          ...TRANSPORT_PROGRAM.inputs[1],
          minimum: 0,
          maximum: 0,
        },
        "0",
      ),
    ).toBeNull();
  });

  it("explains minimum and maximum values", () => {
    expect(
      adapter.calculatorInputError(TRANSPORT_PROGRAM.inputs[0], "-1"),
    ).toBe("Age: enter 0 or more.");
    expect(
      adapter.calculatorInputError(TRANSPORT_PROGRAM.inputs[0], "121"),
    ).toBe("Age: enter 120 or less.");
  });

  it("agrees with request validation for every generated field value", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.double({ noNaN: true, noDefaultInfinity: true }).map(String),
        ),
        (value) => {
          for (const input of TRANSPORT_PROGRAM.inputs) {
            const program = { ...TRANSPORT_PROGRAM, inputs: [input] };
            expect(adapter.calculatorInputError(input, value) === null).toBe(
              adapter.validateInputs(program, { [input.variable]: value })
                .length === 0,
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
