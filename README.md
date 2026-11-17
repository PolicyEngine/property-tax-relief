# Rent and property taxes across states

A source-linked research review of selected income-tax credits and deductions, circuit breakers, renter credits, separate rebates and property-bill programs across all 50 US states and the District of Columbia.

## Scope

The comparison uses program-specific 2025 reference periods. Its initial source pass ran November 13–14, 2026, with targeted follow-up checks on November 17, 2026. A program's income, assessment, tax-payment, filing and benefit-payment years can differ; its `programYear` field records that distinction. The profiles describe later changes separately. The main comparison includes identified statewide credits, rebates and income-tax deductions. Deductions reduce taxable income; their dollar limits are not cash benefits or tax savings. Selected exemptions, assessment limits, deferrals and local programs provide separate context. The inventory is not exhaustive, and state-return subtractions, itemization rules and federal-state conformity still require a systematic audit. Every jurisdiction appears in the inventory, including those without an identified statewide credit.

`inventoryStatus: researched` records completion of an initial source pass, the label shown in the report. `statewideCreditStatus: identified` records an identified program in its stated reference cycle. These fields do not establish exhaustive coverage, validated calculations or adjudication of transitional claims. South Dakota's historical entry describes its 2025 application cycle; its property-refund repeal took effect July 1, 2026, and accrued-claim and assessment/payable-year questions remain explicit in that profile.

This report describes program rules and matching model declarations. It provides no household estimates. Declaration presence does not establish that a model implements the recorded program correctly. Household calculations require separate validation of the exact scenario, eligibility rules, timing and interactions; a missing implementation never supplies a zero benefit.

## Review artifacts

The `artifacts/` directory contains a self-contained interactive (`index.html`), a report (`report.html`), methods (`methods.html`), and the matching JSON/CSV downloads. These local research drafts do not require a running server. They describe program rules; household calculations and independent review remain outstanding. The inventory does not establish exhaustive program coverage or provide a filing determination.

Browser and static inventory CSV downloads use the same serializer and 20-column schema. `program_id` joins each program to the JSON inventory and coverage audit. `payment_mechanism` records the explicit mechanism separately from `refundable`; an unclassified mechanism uses `not-established`. `state_research_notes` carries profile boundaries and omissions on each program row; `source_urls` combines program and state references without duplicates. CSVs use UTF-8 with a byte-order mark, CRLF row endings, quoted cells, lowercase booleans and empty cells for null refundability. The serializer escapes embedded quotes and guards spreadsheet formula prefixes.

## Housing-expense model-route index

The source index in `data/housing-expense-model-routes.json` maps selected 2025 declaration dependencies for personal rent and property-tax expenses across all 50 states and DC. Route kinds separate deductions, credits and credit components, rebates, property-bill reductions and income add-backs. Itemization and base fields describe selected state and federal source paths. Each entry links to the inspected PolicyEngine US source at commit `5b18694981c758e0ae52042eb103e55e0333c7ef`.

The index does not validate legal entitlement, household amounts, runtime behavior or the model version serving a live calculation. A missing route does not establish legal absence or a zero benefit. CSV rows retain these limits and the false validation flags alongside their source records; structured fields use nested JSON.

Check the canonical, public and offline JSON/CSV copies without importing a tax model:

```sh
uv run python scripts/build_housing_expense_routes.py --check
```

Add `--model-repo /absolute/path/to/policyengine-us` to verify the source hashes and line references against that immutable commit. Use `--write` to regenerate the public and offline JSON/CSV copies from the source index. After editing the methods page, run `bun run artifacts:build` to rebuild the offline HTML. The check rejects stale committed data copies; it does not certify spreadsheet import behavior.

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

`bun run dev` serves the Next.js development version at `http://localhost:3075`; after building, `bun run start` serves the static export there. Linux CI exercises the served app and the saved HTML with networking disabled, including search, comparison limits, renter filters, full CSV downloads and mobile layout. CI retains screenshots and the browser result as artifacts. The project uses Next App Router, Tailwind and `@policyengine/ui-kit`. The source audit reads the country-model dependency pinned by `policyengine[us]==6.19.0`; the generated audit records its resolved version. It parses declarations without importing country-model code or calculating household amounts.

## Validation and release boundary

Tests cover all 51 jurisdiction records, unique program IDs, source/year metadata, category separation, filter invariants, downloads, generated-data consistency, and separation of shared chrome from tool-specific provenance. The syntactic audit matches undated formulas, formulas starting by 2025, and `adds`/`subtracts` declarations; missing references, input-only variables and later-only formulas enter the gap list. It ignores declaration end dates and does not establish applicability to a 2025 claim or legal correctness.

Run `bun run release:check` to inspect the outstanding national-calculator requirements. Calculator implementation/mapping and calculation-validation gaps remain open. Completing each state's initial source pass does not resolve every transitional claim or establish calculator readiness. Independent review and the website integration must finish before public publication. We do not provide a validated national household calculator.

## Coverage benchmarks

The [Lincoln Institute residential-program database](https://apps.lincolninst.edu/data/significant-features-property-tax/access-database/residential-property-tax-relief-programs), [ITEP’s November 2026 circuit-breaker report](https://itep.org/circuit-breaker-credits-the-best-tools-for-property-tax-affordability/) and [AARP Foundation’s Property Tax-Aide guides](https://my.aarpfoundation.org/property-taxes/programs-by-state/) cover different years and group programs differently. Subtracting their record counts does not measure omissions. The [PPI/CLE Maine report](https://legislature.maine.gov/doc/12515) compares credits, exemptions and deferrals within Maine. The report page describes the selected coverage and remaining scope gaps.

## Website integration

The planned site path is `/us/rent-and-property-taxes`, with assets under `/_zones/property-tax-relief`. `bun run build:zone` sets the build-time base path; `vercel.json` maps those paths onto the static export. Ordinary `bun run build` keeps root URLs for local and offline review. [policyengine-app-v2 PR #1568](https://github.com/PolicyEngine/policyengine-app-v2/pull/1568) tracks the host’s route and registry changes. Maintainers must review, merge and deploy that change before the route goes live. Add the direct-host redirect only after verifying the policyengine.org route, following the host repository’s deployment guidance.

## Data and results invariants

- Every national export contains exactly the 50 state codes and DC, with unique program IDs.
- Filtering returns only existing records, preserves order and introduces no duplicates.
- Exported records exactly reproduce the source JSON; displayed counts derive from those records.
- The main comparison includes identified statewide income-tax deductions alongside credits and rebates. Deduction limits describe reductions in taxable income, not cash benefits or tax savings.
- Exemptions, assessment limits, deferrals and local-option programs provide separate context.
- Missing calculations never become $0 benefits; a source-level variable match never becomes a validation claim.
- Future benefit totals must obey statutory caps and program interactions. Each displayed scenario must run through the PolicyEngine interface with its actual inputs; interpolation and side models cannot replace runs.

## Running costs

The Vercel preview serves the existing static export. It does not run an application server, PolicyEngine calculation service, database, scheduled task or serverless function.

| Question                        | Answer                                                                                                                                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What runs while nobody uses it? | No application compute or background work. Vercel retains the static deployment.                                                                                                                            |
| Most it can cost in an hour     | The app reserves no compute capacity. Request and transfer charges depend on traffic and the existing PolicyEngine Vercel team plan; we have not verified a numeric hourly ceiling or project spending cap. |
| Bill review                     | Review Vercel project usage and team billing on November 21, 2026, and before a public launch. Static hosting does not imply unlimited free traffic.                                                        |
| Copies and how each one ends    | Vercel retains immutable preview copies. The project owner removes obsolete previews after replacing them and retires the project when retiring the tool.                                                   |
| Where secrets live              | The static app requires no secrets. Deployment-account credentials remain in the local Vercel credential store. We exclude them from uploads.                                                               |
| Owner and review                | PolicyEngine; Max Ghenis. Review the preview and continued hosting by November 21, 2026.                                                                                                                    |

We configure no Modal, Cloud Run, database or warm-compute exception. Preview access uses Vercel authentication. Hosting this research draft does not certify comprehensive program coverage or household calculations.
