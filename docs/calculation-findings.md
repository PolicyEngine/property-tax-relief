# Calculation audit findings

Research draft, November 13, 2026. The source-level coverage audit covers every inventory record. These historical additional checks inspected selected rules in the pinned `policyengine-us==2.2.1` release and canonical commit `f0c77fdedf8f8d4beba5dfb6b7a0facd5ce49178`. The generated declaration audit was subsequently rebuilt from committed upstream source `93444c30522226f8719af23249a266ebcf331ea4`; its immutable provenance is recorded separately in `public/data/coverage.json`. Neither pass certifies the remaining formulas or reports household impacts.

## Minnesota homeowner refund

The [current agency guidance](https://www.revenue.state.mn.us/homeowners-homestead-credit-refund) describes a 2026 law increasing 2025 homeowner refunds. The revised [2025 M1PR instructions](https://www.revenue.state.mn.us/sites/default/files/2026-06/m1pr-inst-25.pdf) include an additional line for the one-time increase. The inspected `mn_homestead_credit_refund` formula returns the rounded capped base refund without that additional component. The separate special refund also lacks an identified implementation in the inspected Minnesota variable and parameter trees.

## New Jersey program timing and inputs

`nj_senior_freeze` declares an input variable without a formula. The existing cap calculation requires the reimbursement as an input; its default does not establish entitlement. [Official Senior Freeze rules](https://www.nj.gov/treasury/taxation/ptr/eligibility.shtml) require historical eligibility and property-tax facts.

The inspected Stay NJ eligibility formula begins in 2026, and parameters express payment-year and annualized semantics. [Current guidance for the 2025 tax-year application](https://www.nj.gov/treasury/taxation/staynj/index.shtml) describes benefits paid in 2027. A generic calculation with `year=2025` does not represent that award; changing the entire scenario year would also change unrelated inputs and law.

## DC household and expense definitions

The inspected direct senior/disabled relief income variable adds current-period adjusted gross income over the model SPM unit. [2025 ASD100 instructions](https://otr.cfo.dc.gov/sites/default/files/dc/sites/otr/publication/attachments/ASD%20100%20Instructions.pdf) require earlier-year household facts and ownership conditions. A current-year SPM grouping does not establish those facts.

The direct relief and Schedule H formulas independently consume `real_estate_taxes`. Their combination requires a clear gross-versus-net bill convention and sequencing; the draft does not sum them into a household total.

## Colorado rebates

No matching PTC or Disability Assistance Credit implementation was located in the inspected Colorado variable and parameter trees. The [PTC](https://tax.colorado.gov/PTC-rebate) and [DAC](https://tax.colorado.gov/dac) sources describe distinct current eligibility rules. Missing code does not imply no benefit.

## Controlled inputs remain necessary

Minnesota renter calculations require a qualifying Certificate of Rent Paid input, which defaults false in the inspected model. The New York real-property credit uses assessed-value and rent inputs that need reconciliation with the [official 2025 IT-214 definitions](https://www.tax.ny.gov/pdf/2025/inc/it214i_2025.pdf). Ordinary isolated household examples and broader household claims require different checks.

These findings explain why declaration presence alone cannot validate the national calculator. Model corrections and new policy encoding must follow the applicable PolicyEngine and Axiom workflows, with source-derived tests and independent review. Country-model work proceeds in separate draft PRs; the generated upstream audit excludes those unmerged branches.

## Model corrections in progress

[PolicyEngine-US PR 10909](https://github.com/PolicyEngine/policyengine-us/pull/10909) addresses Minnesota homeowner refunds, the New York market-value test, DC historical household and bill facts, and Colorado Disability Assistance Credit. Its focused local run passed 111 YAML cases. [PR 10913](https://github.com/PolicyEngine/policyengine-us/pull/10913) adds the Arkansas homestead bill credit for assessment 2025–2026; its focused local run passed 17 cases covering 52 scenario/tax-unit rows. These results are local test evidence, not independent legal validation or a national calculator certification. Both PRs remain drafts awaiting independent review and remote CI. New source-qualified inputs also require data that the national household dataset does not currently supply.
