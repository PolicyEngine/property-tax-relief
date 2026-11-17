/** Exercise the served application and saved HTML in Linux CI. */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { inventoryCsv } from "../lib/inventory.ts";
import { loadCalculatorPrograms } from "../lib/calculatorData.ts";

if (process.platform !== "linux") {
  throw new Error("Browser QA runs on Linux CI to preserve desktop sessions.");
}

const basePath = process.env.QA_BASE_PATH ?? "";
const liveUrl = process.env.QA_LIVE_URL;
if (
  liveUrl &&
  (new URL(liveUrl).origin !== "https://www.policyengine.org" ||
    new URL(liveUrl).pathname !== "/us/rent-and-property-taxes/")
)
  throw new Error("Live QA is restricted to the published PolicyEngine tool");
const appUrl = liveUrl ?? "http://127.0.0.1:3075" + basePath + "/";
const output = resolve(
  liveUrl
    ? "output/playwright-live"
    : basePath
      ? "output/playwright-zone"
      : "output/playwright",
);
mkdirSync(output, { recursive: true });
const cli = resolve("node_modules/@playwright/cli/playwright-cli.js");
const commandTimeoutMs = 90_000;
const calculatorResponseTimeoutMs = 130_000;
function commandWithTimeout(timeout, ...args) {
  const raw = execFileSync(
    "node",
    [cli, "-s=property-relief-ci", "--json", ...args],
    { encoding: "utf8", timeout },
  );
  console.log(raw);
  const result = JSON.parse(raw);
  if (
    result.isError ||
    result.result?.isError ||
    result.error ||
    result.result?.error
  )
    throw new Error("Browser command failed: " + raw);
  return result;
}
function command(...args) {
  return commandWithTimeout(commandTimeoutMs, ...args);
}
function runCode(action, options = {}, timeout = commandTimeoutMs) {
  return commandWithTimeout(
    timeout,
    "run-code",
    "async (page) => (" +
      action.toString() +
      ")(page," +
      JSON.stringify(options) +
      ")",
  );
}

function buildCalculatorFixture() {
  const directory = resolve(output, "calculator-component-fixture");
  mkdirSync(directory, { recursive: true });
  const entry = resolve(directory, "fixture.tsx");
  const js = resolve(directory, "fixture.js");
  const css = resolve(directory, "fixture.css");
  const html = resolve(directory, "index.html");
  const programs = loadCalculatorPrograms().filter((program) =>
    [
      "in-renters-income-tax-deduction",
      "in-homeowner-income-tax-deduction",
    ].includes(program.id),
  );
  if (programs.length !== 2)
    throw new Error("Missing reviewed IN fixture contracts");
  // CI-only mount of the actual component, never copied into the product export.
  writeFileSync(
    entry,
    `
    import React, { useState } from "react";
    import { createRoot } from "react-dom/client";
    import { Calculator } from ${JSON.stringify(resolve("components/Calculator.tsx"))};
    function Harness() {
      const [mounted, setMounted] = useState(true);
      return <><h1>MOCK transport fixtures — not policy amounts</h1>
        <button onClick={() => setMounted(!mounted)}>{mounted ? "Unmount calculator fixture" : "Mount calculator fixture"}</button>
        {mounted && <Calculator programs={${JSON.stringify(programs)}} states={[{code:"IN",name:"Indiana"},{code:"TX",name:"Texas"}]} />}
      </>;
    }
    createRoot(document.getElementById("root")).render(<Harness />);
  `,
  );
  execFileSync(
    process.execPath,
    [
      "build",
      entry,
      "--outdir",
      directory,
      "--target",
      "browser",
      "--env=NEXT_PUBLIC_*",
      "--define",
      `process.env.NEXT_PUBLIC_BASE_PATH=${JSON.stringify(basePath)}`,
      "--minify",
    ],
    {
      encoding: "utf8",
      timeout: 60_000,
    },
  );
  writeFileSync(
    html,
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>MOCK calculator component QA</title>${existsSync(css) ? '<link rel="stylesheet" href="./fixture.css">' : ""}</head><body><div id="root"></div><script type="module" src="./fixture.js"></script></body></html>`,
  );
  return { js, css, html };
}

async function calculatorDeferredCheck(existingPage, options) {
  const page = await existingPage.context().newPage();
  const completed = [];
  let escapedRequests = 0;
  const bootstrapFailure = new Promise((_, reject) => {
    page.on("pageerror", (error) =>
      reject(
        new Error("MOCK fixture page error: " + error.message.slice(0, 1000)),
      ),
    );
    page.on("console", (message) => {
      if (message.type() === "error")
        reject(
          new Error(
            "MOCK fixture console error: " + message.text().slice(0, 1000),
          ),
        );
    });
  });
  // Attach immediately: a module can fail before navigation finishes.
  bootstrapFailure.catch(() => {});
  try {
    // Fail closed if the controlled fetch fixture misses a calculation request.
    await page.route("**/api/household/calculate", async (route) => {
      escapedRequests += 1;
      await route.abort("blockedbyclient");
    });
    await page.route("**/__calculator-component-qa/*", async (route) => {
      const name = new URL(route.request().url()).pathname.split("/").at(-1);
      const asset = {
        "index.html": [options.html, "text/html"],
        "fixture.js": [options.js, "application/javascript"],
        "fixture.css": [options.css, "text/css"],
      }[name];
      if (!asset) return route.abort("blockedbyclient");
      await route.fulfill({ path: asset[0], contentType: asset[1] });
    });
    await page.addInitScript(() => {
      const originalFetch = window.fetch.bind(window);
      const timeouts = [];
      const originalTimeout = AbortSignal.timeout.bind(AbortSignal);
      AbortSignal.timeout = (milliseconds) => {
        if (milliseconds !== 120_000) return originalTimeout(milliseconds);
        const controller = new AbortController();
        timeouts.push(controller);
        return controller.signal;
      };
      const requests = [];
      window.__calculatorMock = {
        requests,
        complete(index, kind, value = 123.45) {
          const request = requests[index];
          if (!request || request.settled)
            throw new Error("Unknown or settled MOCK request");
          request.settled = true;
          if (kind === "network")
            return request.reject(new TypeError("MOCK network failure"));
          if (kind === "timeout") {
            request.timeout.abort(
              new DOMException("MOCK deadline", "TimeoutError"),
            );
            return request.reject(request.timeout.signal.reason);
          }
          const result = structuredClone(request.body.household);
          for (const members of Object.values(result))
            for (const entity of Object.values(members))
              for (const periods of Object.values(entity))
                if (
                  periods &&
                  !Array.isArray(periods) &&
                  periods["2025"] === null
                )
                  periods["2025"] = kind === "invalid" ? null : value;
          const status = kind === "rate" ? 429 : kind === "service" ? 503 : 200;
          request.resolve(
            new Response(
              JSON.stringify({
                status: status === 200 ? "ok" : "error",
                message: "MOCK transport fixture",
                result,
              }),
              {
                status,
                headers: { "Content-Type": "application/json" },
              },
            ),
          );
        },
      };
      window.fetch = (input, init) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input),
          location.href,
        );
        if (url.pathname !== "/api/household/calculate")
          return originalFetch(input, init);
        if (init?.method !== "POST")
          throw new Error("Unexpected MOCK calculation method");
        // Deliberately ignore abort while deferred, so late callbacks reach the real adapter/component guards.
        return new Promise((resolve, reject) =>
          requests.push({
            body: JSON.parse(init.body),
            signal: init.signal,
            timeout: timeouts.at(-1),
            resolve,
            reject,
            settled: false,
          }),
        );
      };
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const state = page.getByLabel("State or District of Columbia", {
      exact: true,
    });
    const program = page.getByLabel("Program", { exact: true });
    const rent = page.getByLabel("Qualified annual rent paid", { exact: true });
    const calculate = page.getByRole("button", {
      name: "Calculate estimate",
      exact: true,
    });
    const cancel = page.getByRole("button", { name: "Cancel", exact: true });
    const estimate = page.getByRole("complementary", {
      name: "Model estimate",
      exact: true,
    });
    async function reset() {
      await Promise.race([
        (async () => {
          await page.goto(options.url);
          await page.waitForFunction(() => {
            const state = document.getElementById("calculator-state");
            return state instanceof HTMLSelectElement && !state.disabled;
          });
          await state.selectOption("IN");
          await program.selectOption("in-renters-income-tax-deduction");
          await rent.fill("111");
        })(),
        bootstrapFailure,
      ]);
    }
    async function submit(count) {
      await calculate.click();
      await page.waitForFunction(
        (count) => window.__calculatorMock.requests.length === count,
        count,
      );
      if (
        !(await page
          .getByRole("button", { name: "Calculating…", exact: true })
          .isDisabled()) ||
        !(await cancel.isVisible())
      )
        throw new Error("Pending action must disable submit and expose Cancel");
    }
    async function complete(index, kind, value) {
      await page.evaluate(
        ({ index, kind, value }) =>
          window.__calculatorMock.complete(index, kind, value),
        { index, kind, value },
      );
      await page.evaluate(
        () =>
          new Promise((done) =>
            requestAnimationFrame(() => requestAnimationFrame(done)),
          ),
      );
    }
    async function assertClear() {
      if ((await cancel.count()) || (await page.getByRole("alert").count()))
        throw new Error(
          "Cancelled/stale action retained pending state or error",
        );
      if (await estimate.getByText(/^\$[\d,]+\.\d{2}$/).count())
        throw new Error("Cancelled action produced a MOCK result");
    }
    async function assertAlert(text) {
      await page.getByRole("alert").getByText(text, { exact: true }).waitFor();
      await page.waitForFunction(
        () => document.activeElement?.getAttribute("role") === "alert",
      );
      if ((await cancel.count()) || !(await calculate.isEnabled()))
        throw new Error("Failure retained pending ownership");
    }

    for (const action of ["cancel", "input", "program", "state"]) {
      await reset();
      await submit(1);
      if (action === "cancel") await cancel.click();
      if (action === "input") await rent.fill("222");
      if (action === "program")
        await program.selectOption("in-homeowner-income-tax-deduction");
      if (action === "state") await state.selectOption("TX");
      if (
        !(await page.evaluate(
          () => window.__calculatorMock.requests[0].signal.aborted,
        ))
      )
        throw new Error(action + " did not abort its request");
      await complete(0, action === "cancel" ? "ok" : "network");
      await assertClear();
      completed.push(
        action + " cancels pending request and ignores late completion",
      );
    }

    for (const late of ["ok", "network"]) {
      await reset();
      await submit(1);
      await rent.fill("222");
      await submit(2);
      if (late === "ok") {
        await complete(0, late, 111.11);
        if (
          !(await cancel.isVisible()) ||
          (await page.getByRole("alert").count()) ||
          (await estimate.getByText("$111.11", { exact: true }).count())
        )
          throw new Error(
            "Old success cleared/replaced a newer pending action",
          );
      }
      await complete(1, "ok", 222.22);
      await estimate.getByText("$222.22", { exact: true }).waitFor();
      if (late === "network") await complete(0, late);
      if (
        (await cancel.count()) ||
        (await page.getByRole("alert").count()) ||
        !(await page
          .getByRole("button", { name: "Estimate up to date", exact: true })
          .isDisabled())
      )
        throw new Error(
          "Old callback disturbed the newer result or pending ownership",
        );
      completed.push("late " + late + " cannot overwrite newer request/result");
    }

    await reset();
    await submit(1);
    await page
      .getByRole("button", { name: "Unmount calculator fixture", exact: true })
      .click();
    if (
      !(await page.evaluate(
        () => window.__calculatorMock.requests[0].signal.aborted,
      ))
    )
      throw new Error("React unmount did not abort in-flight request");
    await complete(0, "ok", 111.11);
    await page
      .getByRole("button", { name: "Mount calculator fixture", exact: true })
      .click();
    await state.waitFor();
    await assertClear();
    completed.push(
      "actual React unmount aborts and late completion cannot leak into remount",
    );

    for (const [kind, message] of [
      [
        "rate",
        "People on the same network share a calculation limit. Wait at least one minute before calculating again.",
      ],
      [
        "network",
        "The calculator could not reach PolicyEngine. People on the same network share a calculation limit; check your connection and wait one minute before trying again.",
      ],
      [
        "service",
        "PolicyEngine cannot calculate this scenario right now. You can try again later.",
      ],
      ["timeout", "The calculation took too long. You can try again later."],
      [
        "invalid",
        "PolicyEngine did not return a numerical result for this scenario. The estimate remains unavailable.",
      ],
    ]) {
      await reset();
      await submit(1);
      await complete(0, kind);
      await assertAlert(message);
      if (await estimate.getByText(/^\$[\d,]+\.\d{2}$/).count())
        throw new Error("Failed output became a MOCK amount");
      if (["rate", "network"].includes(kind)) {
        await calculate.click();
        await assertAlert(
          kind === "rate"
            ? message
            : "People on the same network share a calculation limit. Wait at least one minute before calculating again.",
        );
        if (
          (await page.evaluate(
            () => window.__calculatorMock.requests.length,
          )) !== 1
        )
          throw new Error("Cooldown sent another request");
      }
      completed.push(
        kind +
          " error announces/focuses alert, clears pending, preserves unavailable result",
      );
    }

    await reset();
    await submit(1);
    await complete(0, "ok", 111.11);
    await estimate.getByText("$111.11", { exact: true }).waitFor();
    await rent.fill("222");
    await submit(2);
    await complete(1, "service");
    await assertAlert(
      "PolicyEngine cannot calculate this scenario right now. You can try again later.",
    );
    await estimate.getByText("$111.11", { exact: true }).waitFor();
    await estimate
      .getByText(
        "Previous estimate. Calculate again to use your current inputs.",
        { exact: true },
      )
      .waitFor();
    if ((await estimate.locator('[aria-live="polite"]').count()) !== 1)
      throw new Error("Estimate must have one concise live status");
    completed.push(
      "failed recalculation preserves explicitly stale result beside focused error and one live status",
    );
    if (escapedRequests)
      throw new Error("MOCK transport fixture attempted a real API request");
    return {
      status: "PASS",
      fixtureType: "MOCK_TRANSPORT_NOT_POLICY_VALIDATION",
      completed,
      escapedRequests,
    };
  } finally {
    await page.close();
  }
}

async function servedCheck(page, options) {
  await page
    .getByRole("group", { name: "States in alphabetical order" })
    .waitFor();
  if ((await page.locator(".state-tile").count()) !== 51)
    throw new Error("Served app must show all 51 jurisdictions");
  await page.getByLabel("State or program", { exact: true }).fill("exemption");
  await page.getByRole("button", { name: /^California:/ }).click();
  const contextMatch = page.getByRole("region", {
    name: "Matching contextual provisions",
    exact: true,
  });
  await contextMatch.waitFor();
  if ((await contextMatch.getByRole("listitem").count()) === 0)
    throw new Error(
      "Hidden-context search must explain the matching provisions",
    );
  await contextMatch
    .getByRole("button", { name: "Show all recorded programs", exact: true })
    .click();
  await page.getByRole("heading", { name: /homeowners.*exemption/i }).waitFor();
  await page
    .getByLabel("Include exemptions, limits, deferrals and local options", {
      exact: true,
    })
    .uncheck();
  await page.evaluate(() => document.fonts.ready);
  if (
    !(await page.evaluate(() =>
      performance
        .getEntriesByType("resource")
        .some((entry) => /\.woff2?(?:[?#]|$)/.test(entry.name)),
    ))
  )
    throw new Error("Served page must load its self-hosted font asset");
  await page.getByLabel("State or program", { exact: true }).fill("Wisconsin");
  await page.getByRole("heading", { name: "Wisconsin", exact: true }).waitFor();
  await page.screenshot({ path: options.screenshot, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  if (
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    )
  )
    throw new Error("Served mobile layout overflows horizontally");
  await page.screenshot({ path: options.mobileScreenshot, fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  const escapedLinks = await page
    .locator('a[href^="/"]')
    .evaluateAll(
      (links, prefix) =>
        links
          .map((link) => link.getAttribute("href"))
          .filter((href) => prefix && !href.startsWith(prefix + "/")),
      options.basePath,
    );
  if (escapedLinks.length)
    throw new Error("Links escaped zone: " + escapedLinks.join(","));
  await page
    .getByRole("link", { name: "Read the report", exact: true })
    .click();
  if ((await page.locator(".report-profile").count()) !== 51)
    throw new Error("Served report must include all profiles");
  await page.emulateMedia({ media: "print" });
  await page
    .locator(".report-profile details:not([open]) .expanded-notes")
    .first()
    .waitFor({ state: "visible" });
  await page.emulateMedia({ media: "screen" });
  await page
    .getByRole("link", { name: "Data and methods", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Sources and methods.", exact: true })
    .waitFor();
}

async function offlineLoad(page, options) {
  await page.context().setOffline(true);
  await page.goto(options.url);
  await page
    .getByRole("group", { name: "States in alphabetical order" })
    .waitFor();
  if ((await page.locator(".state-tile").count()) !== 51)
    throw new Error("Offline artifact must show all 51 jurisdictions");
}

async function calculatorCheck(page, options) {
  const clientPageErrors = [];
  const failedAssetUrls = [];
  const failedAssetResponses = [];
  function diagnosticUrl(value) {
    try {
      const url = new URL(value);
      if (
        !["https://www.policyengine.org", "http://127.0.0.1:3075"].includes(
          url.origin,
        ) ||
        url.username ||
        url.password ||
        ![
          "/us/rent-and-property-taxes",
          "/_zones/property-tax-relief/_next/",
          "/_next/",
        ].some((prefix) => url.pathname.startsWith(prefix))
      )
        return null;
      return (url.origin + url.pathname).slice(0, 2048);
    } catch {
      return null;
    }
  }
  function diagnosticText(value, limit) {
    return String(value)
      .replace(
        /https?:\/\/[^\s"'<>]+/g,
        (url) => diagnosticUrl(url) ?? "[other URL]",
      )
      .slice(0, limit);
  }
  const onPageError = (error) => {
    if (clientPageErrors.length < 10)
      clientPageErrors.push(diagnosticText(error.message, 1000));
  };
  const onRequestFailed = (request) => {
    if (
      !["script", "stylesheet", "font", "image"].includes(
        request.resourceType(),
      )
    )
      return;
    const url = diagnosticUrl(request.url());
    if (url && failedAssetUrls.length < 15 && !failedAssetUrls.includes(url))
      failedAssetUrls.push(url);
  };
  const onResponse = (response) => {
    if (
      response.status() < 400 ||
      !["script", "stylesheet", "font", "image"].includes(
        response.request().resourceType(),
      )
    )
      return;
    const url = diagnosticUrl(response.url());
    if (url && failedAssetResponses.length < 15)
      failedAssetResponses.push({ url, status: response.status() });
  };
  page.on("pageerror", onPageError);
  page.on("requestfailed", onRequestFailed);
  page.on("response", onResponse);
  let diagnosticPhase = "calculator navigation";
  async function assertResultInViewport(text) {
    await page.waitForFunction(
      (amount) => {
        const result = document
          .getElementById("estimate-heading")
          ?.closest("aside");
        const element = [...(result?.querySelectorAll("p") ?? [])].find(
          (paragraph) => paragraph.textContent.trim() === amount,
        );
        if (!element) return false;
        const headerEdges = [...document.querySelectorAll("body *")].flatMap(
          (element) => {
            const style = getComputedStyle(element);
            const box = element.getBoundingClientRect();
            return ["sticky", "fixed"].includes(style.position) &&
              style.top === "0px" &&
              box.top <= 1 &&
              box.bottom > 0 &&
              box.width >= document.documentElement.clientWidth - 1
              ? [box.bottom]
              : [];
          },
        );
        if (!headerEdges.length) return false;
        const headerBottom = Math.max(...headerEdges);
        const box = element.getBoundingClientRect();
        return (
          box.height > 0 &&
          box.top >= headerBottom &&
          box.bottom <= innerHeight &&
          box.left >= 0 &&
          box.right <= innerWidth
        );
      },
      text,
      { timeout: 5_000 },
    );
  }

  async function screenshotFromTop(path) {
    await page.evaluate(() =>
      window.scrollTo({ top: 0, left: 0, behavior: "instant" }),
    );
    await page.waitForFunction(() => scrollY === 0);
    await page.evaluate(
      () =>
        new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(done)),
        ),
    );
    await page.screenshot({ path, fullPage: true });
  }

  const state = page.getByLabel("State or District of Columbia", {
    exact: true,
  });
  try {
    await page
      .getByRole("link", { name: "Household estimates", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Household estimates", exact: true })
      .waitFor();
    diagnosticPhase = "state choices";
    await state.waitFor();
    await state.locator('option[value="WY"]').waitFor({ state: "attached" });
    const choices = await state
      .locator("option")
      .evaluateAll(
        (options) => options.filter((option) => option.value).length,
      );
    if (choices !== 51)
      throw new Error(
        `Calculator must retain all 51 jurisdictions; found ${choices}`,
      );

    diagnosticPhase = "TX state selection";
    await state.selectOption("TX");
    diagnosticPhase = "Program selector after TX";
    await page
      .getByLabel("Program", { exact: true })
      .selectOption("tx-school-homestead");
  } catch (error) {
    const diagnostic = {
      kind: "CALCULATOR_SELECTOR_FAILURE",
      phase: diagnosticPhase,
      pageUrl: diagnosticUrl(page.url()),
      clientPageErrors,
      failedAssetUrls,
      failedAssetResponses,
      controls: await page
        .evaluate(() => ({
          selectCount: document.querySelectorAll("select").length,
          selects: [...document.querySelectorAll("select")]
            .slice(0, 10)
            .map((select) => ({
              id: select.id.slice(0, 200),
              value: select.value.slice(0, 200),
              optionCount: select.options.length,
              selectedOptionCount: select.selectedOptions.length,
            })),
        }))
        .catch(() => null),
      bodyText: diagnosticText(
        await page
          .locator("body")
          .innerText({ timeout: 2000 })
          .catch(() => "[body unavailable]"),
        8000,
      ),
      screenshot: options.diagnosticScreenshot,
      screenshotCaptured: false,
    };
    try {
      await page.screenshot({
        path: options.diagnosticScreenshot,
        fullPage: true,
        timeout: 5000,
      });
      diagnostic.screenshotCaptured = true;
    } catch (screenshotError) {
      diagnostic.screenshotError = diagnosticText(
        screenshotError.message,
        1000,
      );
    }
    // The existing CLI prints this error JSON; preserve the original timeout failure.
    error.message +=
      "\nCALCULATOR_SELECTOR_DIAGNOSTIC " + JSON.stringify(diagnostic);
    throw error;
  } finally {
    page.off("pageerror", onPageError);
    page.off("requestfailed", onRequestFailed);
    page.off("response", onResponse);
  }
  await page
    .getByLabel("Appraised home value before exemptions", { exact: true })
    .fill("300000");
  const calculate = page.getByRole("button", {
    name: "Calculate estimate",
    exact: true,
  });
  await calculate.click();
  await page
    .getByText("$140,000.00", { exact: true })
    .waitFor({ timeout: options.responseTimeoutMs });
  await page
    .getByText("Home value exempt from school district tax", { exact: true })
    .waitFor();

  await state.selectOption("IN");
  await page
    .getByLabel("Program", { exact: true })
    .selectOption("in-renters-income-tax-deduction");
  const rent = page.getByLabel("Qualified annual rent paid", { exact: true });
  await calculate.click();
  await page
    .getByRole("alert")
    .getByRole("heading", { name: "Check the calculation", exact: true })
    .waitFor();
  if ((await rent.inputValue()) !== "")
    throw new Error("Missing rent must remain blank");
  await rent.fill("3400");
  await calculate.click();
  await page
    .getByText("$3,000.00", { exact: true })
    .waitFor({ timeout: options.responseTimeoutMs });
  await page
    .getByText("Deduction from taxable income", { exact: true })
    .waitFor();
  await assertResultInViewport("$3,000.00");
  await screenshotFromTop(options.screenshot);
  await rent.fill("1200");
  await page
    .getByText(
      "Previous estimate. Calculate again to use your current inputs.",
      { exact: true },
    )
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await calculate.click();
  await page
    .getByText("$1,200.00", { exact: true })
    .waitFor({ timeout: options.responseTimeoutMs });
  await assertResultInViewport("$1,200.00");
  if (
    !(await page
      .getByRole("button", { name: "Estimate up to date", exact: true })
      .isDisabled())
  )
    throw new Error("Unchanged inputs must not recalculate");
  if (
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    )
  )
    throw new Error("Calculator mobile layout overflows");
  await screenshotFromTop(options.mobileScreenshot);
  await state.selectOption("HI");
  await page
    .getByLabel("Program", { exact: true })
    .selectOption("hi-low-income-household-renters-credit");
  await page
    .getByRole("heading", { name: "Calculation unavailable", exact: true })
    .waitFor();
  await page
    .getByText(
      "This preview cannot evaluate whether another taxpayer could claim you as a dependent.",
      { exact: true },
    )
    .waitFor();
  if (
    await page
      .getByRole("complementary", { name: "Model estimate", exact: true })
      .getByText(/^\$[\d,]+(?:\.\d{2})?$/)
      .count()
  )
    throw new Error("A held program must clear the prior monetary estimate");
  if (
    await page
      .getByRole("button", { name: "Calculate estimate", exact: true })
      .count()
  )
    throw new Error("A held program must not offer a calculation");
  await page
    .getByRole("link", {
      name: "2025 N-11 instructions, Schedule X Part I, line 3",
      exact: true,
    })
    .waitFor();
  await screenshotFromTop(options.holdScreenshot);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
}

async function offlineInteractions(page, options) {
  if (await page.locator('a[href="/methods/"]').count())
    throw new Error("Offline audit links must stay in saved HTML");
  const search = page.getByLabel("State or program", { exact: true });
  await search.fill("Wisconsin");
  await page.getByRole("heading", { name: "Wisconsin", exact: true }).waitFor();
  if ((await page.locator(".state-tile").count()) !== 1)
    throw new Error("State search did not filter");
  if (
    !(await page
      .getByRole("button", { name: "Compare this state", exact: true })
      .isDisabled())
  )
    throw new Error("Fourth comparison must be disabled");
  await page.getByLabel("State 3", { exact: true }).selectOption("");
  await page
    .getByRole("button", { name: "Compare this state", exact: true })
    .click();
  if ((await page.getByLabel("State 3", { exact: true }).inputValue()) !== "WI")
    throw new Error("Comparison did not add Wisconsin");
  if (
    !(await page.locator('#comparison-state-0 option[value="WI"]').isDisabled())
  )
    throw new Error("Duplicate comparison must be disabled");
  await search.fill("no-state-can-match-this");
  await page
    .getByRole("heading", { name: "No matching state profiles", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  if ((await page.locator(".state-tile").count()) !== 51)
    throw new Error("Clear filters did not restore all states");
  await page.getByLabel("Housing", { exact: true }).selectOption("renter");
  const renterCount = await page.locator(".state-tile").count();
  if (renterCount < 1 || renterCount >= 51)
    throw new Error("Renter filter did not narrow the inventory");
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download full inventory (CSV)", exact: true })
    .click();
  await (await downloadEvent).saveAs(options.download);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: options.screenshot, fullPage: true });
  if (
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    )
  )
    throw new Error("Mobile layout overflows horizontally");
  await page.goto(options.report);
  if ((await page.locator(".report-profile").count()) !== 51)
    throw new Error("Offline report must include all profiles");
  await page.goto(options.methods);
  await page
    .getByRole("heading", { name: "Sources and methods.", exact: true })
    .waitFor();
}

const server = liveUrl
  ? null
  : spawn(process.execPath, ["run", "start"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
let serverLog = "";
server?.stdout.on("data", (chunk) => (serverLog += chunk));
server?.stderr.on("data", (chunk) => (serverLog += chunk));
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(appUrl, {
        signal: AbortSignal.timeout(500),
      });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // The task-owned server is still starting.
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  if (!ready) throw new Error("Server did not start: " + serverLog);
  command("open", appUrl, "--browser=chrome");
  command("snapshot");
  runCode(servedCheck, {
    screenshot: resolve(output, "served-desktop.png"),
    mobileScreenshot: resolve(output, "served-mobile.png"),
    basePath,
  });
  command("snapshot");
  runCode(
    calculatorCheck,
    {
      screenshot: resolve(output, "calculator-desktop.png"),
      mobileScreenshot: resolve(output, "calculator-mobile.png"),
      holdScreenshot: resolve(output, "calculator-hawaii-unavailable.png"),
      diagnosticScreenshot: resolve(
        output,
        "calculator-selector-diagnostic.png",
      ),
      responseTimeoutMs: calculatorResponseTimeoutMs,
    },
    // Two response waits plus the ordinary navigation/assertion budget.
    commandTimeoutMs + 2 * calculatorResponseTimeoutMs,
  );
  const componentFixture = buildCalculatorFixture();
  const componentResult = runCode(calculatorDeferredCheck, {
    ...componentFixture,
    url: new URL("__calculator-component-qa/index.html", appUrl).href,
  });
  writeFileSync(
    resolve(output, "calculator-component-mock-result.json"),
    JSON.stringify(
      {
        fixtureType: "MOCK_TRANSPORT_NOT_POLICY_VALIDATION",
        commandResult: componentResult,
      },
      null,
      2,
    ) + "\n",
  );
  runCode(offlineLoad, {
    url: pathToFileURL(resolve("artifacts/index.html")).href,
  });
  command("snapshot");
  runCode(offlineInteractions, {
    download: resolve(output, "offline-inventory.csv"),
    screenshot: resolve(output, "offline-mobile.png"),
    report: pathToFileURL(resolve("artifacts/report.html")).href,
    methods: pathToFileURL(resolve("artifacts/methods.html")).href,
  });
  const states = JSON.parse(readFileSync("public/data/inventory.json", "utf8"));
  const actualCsv = readFileSync(
    resolve(output, "offline-inventory.csv"),
    "utf8",
  );
  if (actualCsv.replace(/^\uFEFF/, "") !== inventoryCsv(states))
    throw new Error(
      "Filtered browser download must preserve the full inventory",
    );
  writeFileSync(
    resolve(output, "result.json"),
    JSON.stringify(
      { status: "PASS", jurisdictions: 51, offline: true, basePath },
      null,
      2,
    ),
  );
} finally {
  try {
    command("close");
  } finally {
    server?.kill();
    writeFileSync(resolve(output, "server.log"), serverLog);
  }
}
