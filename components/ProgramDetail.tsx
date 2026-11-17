import { appPath } from "@/lib/paths";
import {
  CATEGORY_LABELS,
  isComparisonProgram,
  PAYMENT_MECHANISM_LABELS,
} from "@/lib/inventory";
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
        ? "The source audit found a matching model declaration. It does not validate the program mapping, eligibility rules, timing or interactions."
        : "No audited household calculation is available for this program."}{" "}
      <a href={methodsHref}>View the coverage audit</a>.
    </p>
  );
}

export function ProgramDetail({
  program,
  coverage,
  methodsHref = appPath("/methods/"),
  headingLevel = 3,
}: {
  program: Program;
  coverage?: ProgramCoverage;
  methodsHref?: string;
  headingLevel?: 3 | 4;
}) {
  const headingId = `program-${program.id}`;
  const Heading = headingLevel === 4 ? "h4" : "h3";
  return (
    <article className="program-detail" aria-labelledby={headingId}>
      <div className="eyebrow">
        {CATEGORY_LABELS[program.category]} ·{" "}
        {program.scope === "statewide" ? "Statewide" : "Local option"}
      </div>
      <Heading id={headingId}>{program.name}</Heading>
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
          <dd>
            {
              PAYMENT_MECHANISM_LABELS[
                program.paymentMechanism ?? "not-established"
              ]
            }
          </dd>
        </div>
        {program.paymentMechanism === "income-tax-credit" &&
          program.refundable !== null && (
            <div>
              <dt>Income-tax credit refundability</dt>
              <dd>
                {program.refundable
                  ? "Refundable"
                  : "Limited to income-tax liability"}
              </dd>
            </div>
          )}
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
