import type {
  ScenarioTemplate,
  ScenarioPersonalizationPreview,
} from '@future-flow/contracts';
type Facts =
  | Pick<
      ScenarioTemplate,
      'identity' | 'environment' | 'goals' | 'startingState' | 'constraints'
    >
  | ScenarioPersonalizationPreview['facts'];
const label = (value: string | number | null) =>
  value === null ? 'Not specified' : String(value).replaceAll('_', ' ');
export function ScenarioFacts({ facts }: { facts: Facts }) {
  const s = facts.startingState;
  return (
    <div className="scenario-facts">
      <h3>Identity and setting</h3>
      <p>
        {label(facts.identity.mode)} · {label(facts.identity.label)} · Age{' '}
        {label(facts.identity.ageBand)}
      </p>
      <p style={{ whiteSpace: 'pre-wrap' }}>{facts.environment.description}</p>
      <h3>Goals</h3>
      {facts.goals.map((goal) => (
        <section key={goal.key}>
          <h4>
            {label(goal.priority)} goal: {goal.description}
          </h4>
          <p>
            {label(goal.category)} · {goal.horizonMonths} months · {goal.status}
          </p>
          <p>Motivation: {label(goal.motivation)}</p>
          <p>
            Acceptable tradeoffs:{' '}
            {goal.acceptableTradeoffs.join('; ') || 'None specified'}
          </p>
          <p>
            Unacceptable tradeoffs:{' '}
            {goal.unacceptableTradeoffs.join('; ') || 'None specified'}
          </p>
          <p>Progress note: {label(goal.note)}</p>
        </section>
      ))}
      <h3>Starting situation — {s.effectiveAt}</h3>
      <p>
        Work: {label(s.employment.status)} · {label(s.employment.workDomain)} ·
        Employer label: {label(s.employment.employerLabel)}
      </p>
      <p>
        Location: {label(s.location.country)} · {label(s.location.region)} ·
        Housing: {label(s.location.housing)}
      </p>
      <p>
        Money: {label(s.finance.currency)} · Monthly income:{' '}
        {label(s.finance.monthlyIncome)} · Liquid funds:{' '}
        {label(s.finance.liquidFunds)}
      </p>
      <p>
        Energy: {label(s.resources.energy)} / 100 · Available hours per week:{' '}
        {label(s.resources.availableHoursPerWeek)}
      </p>
      <p>Skills: {s.skills.join('; ') || 'None specified'}</p>
      <h4>Owned assets</h4>
      {s.ownedAssets.length ? (
        <ul>
          {s.ownedAssets.map((a) => (
            <li key={a.key}>
              {a.label} · {a.kind} · {a.sharePercent}% owned
            </li>
          ))}
        </ul>
      ) : (
        <p>None specified</p>
      )}
      <h4>People</h4>
      {s.actors.length ? (
        <ul>
          {s.actors.map((a) => (
            <li key={a.key}>
              {a.label} · {a.relationship}
            </li>
          ))}
        </ul>
      ) : (
        <p>None specified</p>
      )}
      <h4>Opportunities</h4>
      {s.opportunities.length ? (
        <ul>
          {s.opportunities.map((o) => (
            <li key={o.key}>
              {o.title} · {o.status} · Expires: {label(o.expiresAt)}
            </li>
          ))}
        </ul>
      ) : (
        <p>None specified</p>
      )}
      <h3>Conditions</h3>
      {facts.constraints.length ? (
        <ul>
          {facts.constraints.map((c) => (
            <li key={c.key}>
              <p>
                {c.description} ·{' '}
                {c.strength === 'hard' ? 'Required' : 'Preferred'} ·{' '}
                {c.scope === 'life' ? 'Whole life' : 'This branch'} · From{' '}
                {c.validFrom} · Until {label(c.validUntil)}
              </p>
              <p>
                {c.predicate.type === 'country_is'
                  ? `Country must be ${label(c.predicate.value)}`
                  : c.predicate.type === 'employment_status_is'
                    ? `Work status must be ${label(c.predicate.value)}`
                    : c.predicate.type === 'liquid_funds_at_least'
                      ? `Keep at least ${c.predicate.amount} ${c.predicate.currency} in liquid funds`
                      : `${c.predicate.owned ? 'Keep ownership of' : 'Do not own'} ${s.ownedAssets.find((a) => c.predicate.type === 'asset_is_owned' && a.key === c.predicate.assetKey)?.label ?? 'the referenced asset'}`}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p>None specified</p>
      )}
    </div>
  );
}
