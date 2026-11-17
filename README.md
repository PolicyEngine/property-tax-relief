# Rent and property taxes across states

A source-linked research review of selected income-tax credits and deductions, circuit breakers, renter credits, separate rebates and property-bill programs across all 50 US states and the District of Columbia.

## Scope

The comparison uses program-specific 2025 reference periods. Its initial source pass ran November 13–14, 2026, with targeted follow-up checks on November 17, 2026. A program's income, assessment, tax-payment, filing and benefit-payment years can differ; its `programYear` field records that distinction. The profiles describe later changes separately. The main comparison includes identified statewide credits, rebates and income-tax deductions. Deductions reduce taxable income; their dollar limits are not cash benefits or tax savings. Selected exemptions, assessment limits, deferrals and local programs provide separate context. The inventory does not enumerate every program, state-return subtraction, itemization rule or federal-state conformity provision. Every jurisdiction appears in the inventory, including those without an identified statewide credit.

`inventoryStatus: researched` records completion of an initial source pass, the label shown in the report. `statewideCreditStatus: identified` records an identified program in its stated reference cycle. These fields do not establish exhaustive coverage, validated calculations or adjudication of transitional claims. South Dakota's historical entry describes its 2025 application cycle; its property-refund repeal took effect July 1, 2026, and that profile identifies uncertain accrued-claim and assessment/payable-year rules.

This report describes program rules and matching model declarations. It provides no household estimates. Declaration presence does not establish that a model implements the recorded program correctly. Household calculations require separate validation of the exact scenario, eligibility rules, timing and interactions; a missing implementation never supplies a zero benefit.

## Review artifacts

The `artifacts/` directory contains a self-contained interactive (`index.html`), a report (`report.html`), methods (`methods.html`), and the matching JSON/CSV downloads. These files run without a server and describe program rules. The public calculator preview adds live estimates for selected programs. The inventory does not establish exhaustive program coverage or provide a filing determination.

## Household calculator preview

The `/calculator/` page calculates 2025 scenarios for one adult filing as single, with no spouse or dependents. Its selector includes all 50 states and DC and 119 selected program and context records. Ten programs support calculations across eight states:

- California: nonrefundable renter credit before its tax-liability limit.
- Connecticut: nonrefundable credit for qualified primary-residence property taxes.
- Illinois: property-tax credit after its income-tax limit.
- Indiana: renter and homeowner income-tax deductions.
- Michigan: homestead property-tax credit for renters.
- New Jersey: property-tax deduction or credit, as PolicyEngine selects.
- Oklahoma: property-tax credit or refund for homestead owners.
- Pennsylvania: property-tax/rent rebate for renters.

Other records show why calculations remain unavailable. Users supply qualified expenses and specified tax-form inputs; the estimate assumes the remaining qualification requirements hold. Connecticut covers primary-residence taxes and uses CT-1040, line 10, as its tax-liability limit; motor-vehicle tax claims require the full Schedule 3. Michigan and Pennsylvania calculations cover renters; Pennsylvania's preview excludes mixed owner-renter claims. Oklahoma calculations cover homestead owners. New Jersey selects one provision, so a zero deduction can accompany a credit or vice versa. Deduction amounts and California's credit before its liability limit do not measure tax savings on a completed return.

Michigan's preview excludes claims that use the senior status for an unremarried surviving spouse whose spouse was 65 or older at death. See [2025 Form MI-1040CR, box 5a](https://www.michigan.gov/taxes/-/media/Project/Websites/taxes/Forms/IIT/TY2025/MI-1040CR.pdf#page=1).

Hawaii excludes taxpayers whom another taxpayer could claim as a dependent, even if nobody claims them. The preview cannot evaluate that condition, so Hawaii's renter credit remains unavailable. See [2025 Schedule X, Part I](https://files.hawaii.gov/tax/forms/2025/n11ins.pdf#page=26).

The browser uses `@policyengine/api-client` to send entered scenarios to the website's household-calculation API. Calculations require a network connection and use the shared API's capacity. The app adds no calculation backend or frontend benefit formulas. The adapter rejects missing or invalid outputs, preserves finite returned numbers, cancels obsolete requests, reuses unchanged requests, and caps new requests at 15 per minute per page.

`data/calculator/contracts.json` records input mappings and source evidence. The November 15, 2026 metadata snapshot reported PolicyEngine US 2.2.1. All 31 saved response bodies record `spm_provenance.runtime_versions` labels for PolicyEngine US 2.2.2 and the `policyengine` wrapper 6.20.0 in the [validation receipt](https://github.com/PolicyEngine/property-tax-relief/blob/ea011237f5a2b51c71ad01db9371fe0c66ae1a14/data/calculator/validation-receipt.json). The receipt also records `runtimeModelVersion: null`; its raw response bodies preserve those labels. Requests do not pin a model version, and the recorded labels do not independently establish the runtime that produced each answer.

`data/calculator/validation-cases.json` contains 31 source-derived cases for enabled programs. Saved API responses match their expected values; `scripts/calculator_live_qa.ts` can rerun those checks. The offline unit suite sends no live requests.

The preview does not establish exhaustive coverage or national-calculator readiness.

Browser and static CSV downloads use the same serializer and 22-column schema. `program_id` joins each program to the JSON inventory and model-presence audit. `payment_mechanism` records the explicit mechanism separately from `refundable`; an unclassified mechanism uses `not-established`. `eligibility_notes` and `interactions` retain each program’s condition and coordination notes, joining each source array with `|`. These columns follow `application` and precede `program_year`. `state_research_notes` carries profile boundaries and omissions on each program row; `source_urls` combines program and state references without duplicates. CSVs use UTF-8 with a byte-order mark, CRLF row endings, quoted cells, lowercase booleans and empty cells for null refundability. The serializer escapes embedded quotes and guards spreadsheet formula prefixes. For income-tax credits, `refundable` indicates whether the credit can exceed income-tax liability. For an unclassified mechanism, it carries the recorded flag without identifying how the program pays. The CSV leaves this cell empty for other mechanisms; the JSON retains the recorded flag.

## Reproduce

Use Python 3.13 and Bun 1.3.12:

```sh
uv sync --locked
bun install --frozen-lockfile
bun run data:build
bun run lint
bun run format:check
bun run test
uv run pytest
bun run artifacts:build
```

To compare the installed release with committed canonical source, run:

```sh
uv run python scripts/build_inventory.py \
  --canonical-model /absolute/path/to/policyengine-us \
  --canonical-ref upstream/main
```

The generator resolves the requested ref to an immutable commit and reads its variable files with `git archive`. Staged, modified and untracked working files cannot change that snapshot. `--canonical-ref` defaults to `HEAD`; select `upstream/main` to exclude an unmerged local branch. The audit records the requested ref, resolved commit and committed-source mode separately from the installed-package audit. Without `--canonical-model`, it records canonical source as not inspected. Fetch the intended canonical ref before running the command when you need a newer remote snapshot.

`bun run dev` serves the Next.js development version at `http://localhost:3075`; after building, `bun run start` serves the static export there. Linux CI checks the served app, calculator, and saved HTML, including search, comparison limits, renter filters, full CSV downloads, and mobile layout. Calculator checks use the shared API; saved-HTML checks disable networking. CI retains screenshots and the browser result as artifacts. The project uses Next App Router, Tailwind and `@policyengine/ui-kit`. The model-presence audit reads the country-model dependency pinned by `policyengine[us]==6.19.0`; the generated audit records its resolved version. It parses declarations without importing country-model code or calculating household amounts. The served calculator obtains household estimates through the website's API; its model metadata snapshot appears in the calculator contracts.

## Validation and release boundary

Tests cover all 51 jurisdiction records, unique program IDs, source/year metadata, category separation, filter invariants, downloads, generated-data consistency, and separation of shared chrome from tool-specific provenance. The syntactic audit matches undated formulas, formulas starting by 2025, and `adds`/`subtracts` declarations; missing references, input-only variables and later-only formulas enter the gap list. It ignores declaration end dates and does not establish applicability to a 2025 claim or legal correctness.

Run `bun run release:check` to inspect the outstanding national-calculator requirements. The audit lists implementation, mapping and calculation-validation gaps. Completing each state's initial source pass does not resolve every transitional claim or establish calculator readiness. The report provides no validated national household calculator.

## Coverage benchmarks

The [Lincoln Institute residential-program database](https://apps.lincolninst.edu/data/significant-features-property-tax/access-database/residential-property-tax-relief-programs), [ITEP’s November 2026 circuit-breaker report](https://itep.org/circuit-breaker-credits-the-best-tools-for-property-tax-affordability/) and [AARP Foundation’s Property Tax-Aide guides](https://my.aarpfoundation.org/property-taxes/programs-by-state/) cover different years and group programs differently. Subtracting their record counts does not measure omissions. The [PPI/CLE Maine report](https://legislature.maine.gov/doc/12515) compares credits, exemptions and deferrals within Maine. The report page describes the selected coverage and remaining scope gaps.

## Website integration

The [public report](https://www.policyengine.org/us/rent-and-property-taxes/) and [scoped calculator preview](https://www.policyengine.org/us/rent-and-property-taxes/calculator/) serve under `/us/rent-and-property-taxes`, with assets under `/_zones/property-tax-relief`. Production serves the [deployed source at `a9e407ef`](https://github.com/PolicyEngine/property-tax-relief/tree/a9e407ef6e2b2798746da918e9379e82e36b1541). [policyengine-app-v2 PR #1568](https://github.com/PolicyEngine/policyengine-app-v2/pull/1568) and [PR #1570](https://github.com/PolicyEngine/policyengine-app-v2/pull/1570) supply the host’s route and registry changes.

`bun run build:zone` sets the build-time base path; `vercel.json` maps those paths onto the static export. Ordinary `bun run build` keeps root URLs for local and offline review.

## Data and results invariants

- Every national export contains exactly the 50 state codes and DC, with unique program IDs.
- Filtering returns only existing records, preserves order and introduces no duplicates.
- Exported records exactly reproduce the source JSON; displayed counts derive from those records.
- The main comparison includes identified statewide income-tax deductions alongside credits and rebates. Deduction limits describe reductions in taxable income, not cash benefits or tax savings.
- Exemptions, assessment limits, deferrals and local-option programs provide separate context.
- Missing calculations never become $0 benefits; a source-level variable match never becomes a validation claim.
- Future benefit totals must obey statutory caps and program interactions. Each displayed scenario must run through the PolicyEngine interface with its actual inputs; interpolation and side models cannot replace runs.

## Running costs

The Vercel app serves a static export and runs no application server, calculation service, database, scheduled task, or serverless function of its own. Household calculations use the shared PolicyEngine website API.

| Question                        | Answer                                                                                                                                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What runs while nobody uses it? | No application compute or background work. Vercel retains the static deployment.                                                                                                                            |
| Most it can cost in an hour     | The app reserves no compute capacity. Request and transfer charges depend on traffic and the existing PolicyEngine Vercel team plan; we have not verified a numeric hourly ceiling or project spending cap. |
| Bill review                     | We reviewed Vercel project usage on November 17, 2026; review usage and team billing on November 21. Static hosting does not imply unlimited free traffic.                                                  |
| Copies and how each one ends    | Vercel retains immutable preview copies. The project owner removes obsolete previews after replacing them and retires the project when retiring the tool.                                                   |
| Where secrets live              | The static app requires no secrets. Deployment-account credentials remain in the local Vercel credential store. We exclude them from uploads.                                                               |
| Owner and review                | PolicyEngine; Max Ghenis. Review continued hosting and the calculator preview by November 21, 2026.                                                                                                         |

We configure no Modal, Cloud Run, database or warm-compute exception. Generated deployment URLs and the team alias require Vercel authentication. The public report describes selected programs; it provides no household estimates. The public calculator preview provides estimates for the supported 2025 single-adult scenarios.
