import { appPath } from "@/lib/paths";
import { CATEGORY_LABELS, isComparisonProgram } from "@/lib/inventory";
import type { Program, ProgramCoverage, Source } from "@/lib/types";

export function SourceLinks({
  sources,
  className = "",
}: {
  sources: Source[];
  className?: string;
}) {
  const uniqueSources = [
    ...new Map(sources.map((source) => [source.url, source])).values(),
  ];
  return (
    <div className={`source-links ${className}`}>
      {uniqueSources.map((source) => (
        <a
          key={source.url}
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${source.title} (opens in a new tab)`}
        >
          {source.title} <span aria-hidden="true">↗</span>
        </a>
      ))}
    </div>
  );
}

function paymentMechanism(program: Program) {
  if (program.category === "deferral") return "Repayable tax deferral";
  if (program.category === "exemption")
    return "Reduction in taxable property value";
  if (program.category === "deduction")
    return "Reduction in taxable income; the deduction amount is not a cash credit";
  if (program.category === "assessment-limit")
    return "Limit on assessment or tax growth";
  if (program.refundable === true) return "Refundable credit or cash rebate";
  if (program.refundable === false)
    return "Nonrefundable: limited to applicable tax liability";
  return "See the program's payment mechanism";
}

function CalculationNote({
  program,
  coverage,
  methodsHref,
}: {
  program: Program;
  coverage?: ProgramCoverage;
  methodsHref: string;
}) {
  if (!isComparisonProgram(program)) return null;
  return (
    <p className="model-note">
      <strong>Calculation coverage.</strong>{" "}
      {coverage?.status === "implementation-found"
        ? "A model implementation was found. Its eligibility rules, timing and interactions still need validation."
        : "No audited household calculation is available for this program."}{" "}
      <a href={methodsHref}>View the coverage audit</a>.
    </p>
  );
}

export function ProgramDetail({
  program,
  coverage,
  methodsHref = appPath("/methods/"),
}: {
  program: Program;
  coverage?: ProgramCoverage;
  methodsHref?: string;
}) {
  const headingId = `program-${program.id}`;
  return (
    <article className="program-detail" aria-labelledby={headingId}>
      <div className="eyebrow">
        {CATEGORY_LABELS[program.category]} ·{" "}
        {program.scope === "statewide" ? "Statewide" : "Local option"}
      </div>
      <h3 id={headingId}>{program.name}</h3>
      <p className="program-formula">{program.formulaSummary}</p>
      <dl className="program-facts">
        <div>
          <dt>Who</dt>
          <dd>
            {program.tenures
              .map((tenure) => (tenure === "owner" ? "Homeowners" : "Renters"))
              .join(" and ")}
            . {program.ageRule}
          </dd>
        </div>
        <div>
          <dt>Income limits</dt>
          <dd>{program.incomeLimits}</dd>
        </div>
        <div>
          <dt>Maximum / measure</dt>
          <dd>{program.maximumBenefit}</dd>
        </div>
        <div>
          <dt>Reference period</dt>
          <dd>{program.programYear}</dd>
        </div>
        <div>
          <dt>Payment mechanism</dt>
          <dd>{paymentMechanism(program)}</dd>
        </div>
      </dl>
      <details>
        <summary>Eligibility, claiming and calculation notes</summary>
        <div className="expanded-notes">
          <p>
            <strong>Income definition.</strong> {program.incomeDefinition}
          </p>
          <p>
            <strong>How to claim.</strong> {program.application}
          </p>
          {program.rentProxy !== null && (
            <p>
              <strong>Rent proxy.</strong>{" "}
              {(program.rentProxy * 100).toLocaleString()}% of rent enters this
              program&apos;s statutory calculation. This percentage does not
              measure economic property-tax incidence.
            </p>
          )}
          {program.eligibilityNotes.length > 0 && (
            <ul>
              {program.eligibilityNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
          {program.interactions.length > 0 && (
            <p>
              <strong>Interactions.</strong> {program.interactions.join(" ")}
            </p>
          )}
          <CalculationNote
            program={program}
            coverage={coverage}
            methodsHref={methodsHref}
          />
        </div>
      </details>
      <SourceLinks sources={program.sources} />
    </article>
  );
}
