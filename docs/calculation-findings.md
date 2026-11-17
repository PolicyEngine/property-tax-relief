# Calculation coverage

The report audits source-level declaration presence. The audit reads variable class names, formula method names and declarative `adds`/`subtracts` entries from the pinned sources recorded in `public/data/coverage.json`. It does not execute country-model code or validate legal equivalence, eligibility, parameters, interactions or household amounts. Every record retains `validated: false`, and the audit retains `releaseReady: false`.

Developers track country-model implementation and numerical validation separately in PolicyEngine-US [PR10909](https://github.com/PolicyEngine/policyengine-us/pull/10909), [PR10913](https://github.com/PolicyEngine/policyengine-us/pull/10913), [PR10927](https://github.com/PolicyEngine/policyengine-us/pull/10927) and [PR10933](https://github.com/PolicyEngine/policyengine-us/pull/10933). Those changes require their own primary-source checks, source-derived tests, accounting checks and independent review. A declaration match does not certify those changes or a national household calculator.

Any future household estimate must come from the PolicyEngine rules engine for that exact scenario, with the applicable policy year, household facts and program interactions.
