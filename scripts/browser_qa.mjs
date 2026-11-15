/** Exercise the served application and saved HTML in Linux CI. */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { inventoryCsv } from "../lib/inventory.ts";

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
function command(...args) {
  const raw = execFileSync(
    "node",
    [cli, "-s=property-relief-ci", "--json", ...args],
    { encoding: "utf8", timeout: 90_000 },
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
function runCode(action, options = {}) {
  command(
    "run-code",
    "async (page) => (" +
      action.toString() +
      ")(page," +
      JSON.stringify(options) +
      ")",
  );
}

async function servedCheck(page, options) {
  await page
    .getByRole("group", { name: "States in alphabetical order" })
    .waitFor();
  if ((await page.locator(".state-tile").count()) !== 51)
    throw new Error("Served app must show all 51 jurisdictions");
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

  await page
    .getByRole("link", { name: "Household estimates", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Household estimates", exact: true })
    .waitFor();
  const state = page.getByLabel("State or District of Columbia", {
    exact: true,
  });
  await state.waitFor();
  await state.locator('option[value="WY"]').waitFor({ state: "attached" });
  const choices = await state
    .locator("option")
    .evaluateAll((options) => options.filter((option) => option.value).length);
  if (choices !== 51)
    throw new Error(
      `Calculator must retain all 51 jurisdictions; found ${choices}`,
    );

  await state.selectOption("TX");
  await page.getByLabel("Program", { exact: true }).selectOption({ index: 1 });
  await page
    .getByRole("heading", { name: "Calculation unavailable", exact: true })
    .waitFor();
  if (await page.getByText(/^\$0(?:\.00)?$/).count())
    throw new Error("Unavailable is not a zero result");

  await state.selectOption("IN");
  await page
    .getByLabel("Program", { exact: true })
    .selectOption("in-renters-income-tax-deduction");
  const rent = page.getByLabel("Qualified annual rent paid", { exact: true });
  const calculate = page.getByRole("button", {
    name: "Calculate estimate",
    exact: true,
  });
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
    .waitFor({ timeout: 130_000 });
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
    .waitFor({ timeout: 130_000 });
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
  runCode(calculatorCheck, {
    screenshot: resolve(output, "calculator-desktop.png"),
    mobileScreenshot: resolve(output, "calculator-mobile.png"),
    holdScreenshot: resolve(output, "calculator-hawaii-unavailable.png"),
  });
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
