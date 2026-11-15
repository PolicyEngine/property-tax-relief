# Rent and property taxes across states

A source-linked research review of selected income-tax credits and deductions, circuit breakers, renter credits, separate rebates and property-bill programs across all 50 US states and the District of Columbia.

## Scope

The comparison uses program-specific 2025 reference periods, with official sources checked on November 13–14, 2026. A program's income, assessment, tax-payment, filing and benefit-payment years can differ; its `programYear` field records that distinction. We identify later changes separately. The main comparison includes identified statewide credits, rebates and income-tax deductions. Deductions reduce taxable income; their dollar limits are not cash benefits or tax savings. Selected exemptions, assessment limits, deferrals and local programs provide separate context. The inventory is not exhaustive, and state-return subtractions, itemization rules and federal-state conformity still require a systematic audit. Every jurisdiction appears in the inventory, including those without an identified statewide credit.

`inventoryStatus: researched` records completion of an initial source pass, the label shown in the report. `statewideCreditStatus: identified` records an identified program in its stated reference cycle. These fields do not establish exhaustive coverage, validated calculations or adjudication of transitional claims. South Dakota's historical entry describes its 2025 application cycle; its property-refund repeal took effect July 1, 2026, and accrued-claim and assessment/payable-year questions remain explicit in that profile.

Every numerical household result must come from the PolicyEngine model for that exact scenario. We audit model coverage and legal coverage separately. Missing implementations must not appear as zero benefits. Publishing this research draft requires independent review and website integration checks. A national household calculator additionally requires a completed scope audit and validated models, scenarios and interactions.

## Review artifacts

The `artifacts/` directory contains a self-contained interactive (`index.html`), a report (`report.html`), methods (`methods.html`), and the matching JSON/CSV downloads. These local research drafts do not require a running server. These artifacts describe program rules. The served calculator preview adds live estimates for selected programs; independent review remains outstanding. The inventory does not establish exhaustive program coverage or provide a filing determination.

## Household calculator preview

The `/calculator/` page calculates 2025 scenarios for one adult filing as single, with no spouse or dependents. Its selector includes all 50 states and DC and 119 selected program and context records. Eight programs support calculations across six states:

- California: nonrefundable renter credit before its tax-liability limit.
- Hawaii: low-income household renter credit.
- Illinois: property-tax credit after its income-tax limit.
- Indiana: renter and homeowner income-tax deductions.
- Michigan: homestead property-tax credit for renters.
- New Jersey: property-tax deduction or credit, as PolicyEngine selects.

Other records show why calculations remain unavailable. Users supply qualified expenses and specified tax-form inputs; the estimate assumes the remaining qualification requirements hold. Michigan homeowner claims remain outside this calculator's scope. New Jersey selects one provision, so a zero deduction can accompany a credit or vice versa. Deduction amounts and California's credit before its liability limit do not measure tax savings on a completed return.

The browser uses `@policyengine/api-client` to send entered scenarios to the website's household-calculation API. Calculations require a network connection and use the shared API's capacity. The app adds no calculation backend or frontend benefit formulas. The adapter rejects missing or invalid outputs, preserves finite returned numbers, cancels obsolete requests, reuses unchanged requests, and caps new requests at 15 per minute per page.

`data/calculator/contracts.json` records input mappings and source evidence. The metadata snapshot reported PolicyEngine US 2.2.1 on November 15, 2026; each calculation response supplies no model-version receipt. `data/calculator/validation-cases.json` contains source-derived cases, which `scripts/calculator_live_qa.ts` explicitly checks against the API. The offline unit suite sends no live requests.

Independent review and publication checks remain open. The preview does not establish exhaustive coverage or national-calculator readiness.

## Reproduce

Use Python 3.13 and Bun 1.3.12:

```sh
uv sync --locked
bun install --frozen-lockfile
bun run data:build
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

`bun run dev` serves the Next.js development version at `http://localhost:3075`; after building, `bun run start` serves the static export there. Linux CI checks the served app, calculator, and saved HTML, including search, comparison limits, renter filters, full CSV downloads, and mobile layout. Calculator checks use the shared API; saved-HTML checks disable networking. CI retains screenshots and the browser result as artifacts. The project uses Next App Router, Tailwind and `@policyengine/ui-kit`. The research audit uses `policyengine[us]==6.19.0` and records its resolved country-model pin in the generated coverage audit. The served calculator obtains household estimates through the website's API; its model metadata snapshot appears in the calculator contracts.

## Validation and release boundary

Tests cover all 51 jurisdiction records, unique program IDs, source/year metadata, category separation, filter invariants, downloads, generated-data consistency, and separation of shared chrome from tool-specific provenance. The source-level audit distinguishes available calculation declarations from missing references, input-only variables, and later-starting formulas. Declaration presence does not validate legal correctness.

Run `bun run release:check` to inspect the outstanding national-calculator requirements. Calculator implementation/mapping and calculation-validation gaps remain open. Completing each state's initial source pass does not resolve every transitional claim or establish calculator readiness. Independent review and the website integration must finish before public publication. We do not provide a validated national household calculator.

## Coverage benchmarks

This inventory is not a replacement for an exhaustive program register. We reconcile it against the [Lincoln Institute residential-program database](https://apps.lincolninst.edu/data/significant-features-property-tax/access-database/residential-property-tax-relief-programs), [ITEP’s November 2026 circuit-breaker report](https://itep.org/circuit-breaker-credits-the-best-tools-for-property-tax-affordability/) and [AARP Foundation’s Property Tax-Aide guides](https://my.aarpfoundation.org/property-taxes/programs-by-state/). Their years, grouping and inclusion rules differ; subtracting their record counts does not measure omissions. The [PPI/CLE Maine report](https://legislature.maine.gov/doc/12515) provides a state-focused comparison of credits, exemptions and deferrals. The report page records confirmed omissions and remaining scope gaps.

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

The Vercel app serves a static export and runs no application server, calculation service, database, scheduled task, or serverless function of its own. Household calculations use the shared PolicyEngine website API.

| Question                        | Answer                                                                                                                                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What runs while nobody uses it? | No application compute or background work. Vercel retains the static deployment.                                                                                                                            |
| Most it can cost in an hour     | The app reserves no compute capacity. Request and transfer charges depend on traffic and the existing PolicyEngine Vercel team plan; we have not verified a numeric hourly ceiling or project spending cap. |
| Bill review                     | Review Vercel project usage and team billing on November 21, 2026, and before a public launch. Static hosting does not imply unlimited free traffic.                                                        |
| Copies and how each one ends    | Vercel retains immutable preview copies. The project owner removes obsolete previews after replacing them and retires the project when retiring the tool.                                                   |
| Where secrets live              | The static app requires no secrets. Deployment-account credentials remain in the local Vercel credential store. We exclude them from uploads.                                                               |
| Owner and review                | PolicyEngine; Max Ghenis. Review the preview and continued hosting by November 21, 2026.                                                                                                                    |

We configure no Modal, Cloud Run, database or warm-compute exception. Preview access uses Vercel authentication. Hosting this research draft does not certify comprehensive program coverage or household calculations.
