'use client';
import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  scenarioPersonalProfileSchema,
  type ScenarioPersonalProfile,
} from '@future-flow/contracts';
const blank = (value: string) => (value === '' ? null : value);
const lines = (value: string) =>
  value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
const number = (value: string) => (value === '' ? null : Number(value));
type State = ScenarioPersonalProfile['startingState'];
function TextList({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (value: string[]) => void;
}) {
  const [text, setText] = useState(() => items.join('\n'));
  return (
    <label>
      {label}
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(lines(e.target.value));
        }}
      />
    </label>
  );
}
function Select({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label>
      {label}
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o ? o.replaceAll('_', ' ') : 'Not specified'}
          </option>
        ))}
      </select>
    </label>
  );
}
function Field({
  label,
  value,
  onChange,
  type = 'text',
  maxLength,
  min,
  max,
  required = false,
  disabled = false,
}: {
  label: string;
  value: string | number | null;
  onChange: (value: string) => void;
  type?: string;
  maxLength?: number;
  min?: number;
  max?: number;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <label>
      {label}
      <input
        type={type}
        step={type === 'number' ? 'any' : undefined}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        min={min}
        max={max}
        required={required}
        disabled={disabled}
      />
    </label>
  );
}
function List({
  title,
  children,
  onAdd,
  disabled,
}: {
  title: string;
  children: ReactNode;
  onAdd: () => void;
  disabled: boolean;
}) {
  return (
    <fieldset>
      <legend>{title}</legend>
      {children}
      <button type="button" onClick={onAdd} disabled={disabled}>
        Add {title.toLowerCase()}
      </button>
    </fieldset>
  );
}
export function ScenarioPersonalProfileForm({
  busy,
  contextLimit,
  onPreview,
  initialProfile,
}: {
  busy: boolean;
  contextLimit: number;
  onPreview: (profile: ScenarioPersonalProfile) => Promise<void>;
  initialProfile?: ScenarioPersonalProfile | null;
}) {
  const [p, setP] = useState<ScenarioPersonalProfile>(() =>
      initialProfile
        ? structuredClone(initialProfile)
        : {
            identity: { mode: 'self', label: null, ageBand: '25_34' },
            goals: [
              {
                key: 'goal-1',
                category: 'career',
                description: '',
                priority: 'primary',
                horizonMonths: 12,
                motivation: null,
                acceptableTradeoffs: [],
                unacceptableTradeoffs: [],
                status: 'active',
                note: null,
              },
            ],
            startingState: {
              effectiveAt: new Date().toISOString().slice(0, 10),
              employment: {
                status: null,
                employerLabel: null,
                workDomain: null,
              },
              location: { country: null, region: null, housing: null },
              finance: {
                currency: null,
                monthlyIncome: null,
                liquidFunds: null,
              },
              ownedAssets: [],
              actors: [],
              skills: [],
              opportunities: [],
              resources: { energy: null, availableHoursPerWeek: null },
            },
            constraints: [],
            context: null,
          },
    ),
    [ack, setAck] = useState(false),
    [notice, setNotice] = useState('');
  const state = p.startingState,
    goal = p.goals[0]!;
  function update(next: ScenarioPersonalProfile) {
    setP(next);
    setAck(false);
    setNotice('');
  }
  const start = (patch: Partial<State>) =>
    update({ ...p, startingState: { ...state, ...patch } });
  const mainGoal = (patch: Partial<typeof goal>) =>
    update({ ...p, goals: [{ ...goal, ...patch }] });
  const removeAsset = (key: string) =>
    update({
      ...p,
      startingState: {
        ...state,
        ownedAssets: state.ownedAssets.filter((a) => a.key !== key),
      },
      constraints: p.constraints.filter(
        (c) =>
          c.predicate.type !== 'asset_is_owned' || c.predicate.assetKey !== key,
      ),
    });
  const nextKey = (kind: string, existing: { key: string }[]) => {
    let n = 1;
    while (existing.some((x) => x.key === `${kind}-${n}`)) n++;
    return `${kind}-${n}`;
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!ack || busy) return;
        const result = scenarioPersonalProfileSchema.safeParse(p);
        if (!result.success) {
          setNotice(
            'Check your dates, goal and all added items. Required fields must be filled in.',
          );
          return;
        }
        void onPreview(result.data);
      }}
    >
      <p>
        Enter the starting facts for your private life. The example’s job,
        money, people, assets and conditions will be replaced with these facts.
        Leave unknown facts blank. Use pseudonyms and general locations.
      </p>
      <fieldset disabled={busy}>
        <legend>Identity</legend>
        <Select
          label="Whose life?"
          value={p.identity.mode}
          options={['self', 'alternate']}
          onChange={(v) =>
            update({
              ...p,
              identity: { ...p.identity, mode: v as typeof p.identity.mode },
            })
          }
        />
        <Field
          label="Pseudonym (optional)"
          value={p.identity.label}
          maxLength={160}
          onChange={(v) =>
            update({ ...p, identity: { ...p.identity, label: blank(v) } })
          }
        />
        <Select
          label="Age range"
          value={p.identity.ageBand}
          options={['18_24', '25_34', '35_44', '45_54', '55_64', '65_plus']}
          onChange={(v) =>
            update({
              ...p,
              identity: {
                ...p.identity,
                ageBand: v as typeof p.identity.ageBand,
              },
            })
          }
        />
      </fieldset>
      <fieldset disabled={busy}>
        <legend>Your primary goal</legend>
        <Field
          label="What would you like to work towards?"
          value={goal.description}
          required
          maxLength={500}
          onChange={(v) => mainGoal({ description: v })}
        />
        <Select
          label="Goal category"
          value={goal.category}
          options={[
            'career',
            'business',
            'finance',
            'relationships',
            'family',
            'education',
            'lifestyle',
            'personal_growth',
            'other',
          ]}
          onChange={(v) => mainGoal({ category: v as typeof goal.category })}
        />
        <Field
          label="Goal horizon in months"
          value={goal.horizonMonths}
          type="number"
          min={6}
          max={600}
          required
          onChange={(v) => mainGoal({ horizonMonths: Number(v) })}
        />
        <Field
          label="Why this matters (optional)"
          value={goal.motivation}
          maxLength={500}
          onChange={(v) => mainGoal({ motivation: blank(v) })}
        />
        <TextList
          label="Acceptable tradeoffs (one per line, up to 10)"
          items={goal.acceptableTradeoffs}
          onChange={(v) => mainGoal({ acceptableTradeoffs: v })}
        />
        <TextList
          label="Unacceptable tradeoffs (one per line, up to 10)"
          items={goal.unacceptableTradeoffs}
          onChange={(v) => mainGoal({ unacceptableTradeoffs: v })}
        />
      </fieldset>
      <fieldset disabled={busy}>
        <legend>Starting situation</legend>
        <Field
          label="Start date"
          value={state.effectiveAt}
          type="date"
          required
          onChange={(v) => start({ effectiveAt: v })}
        />
        <Select
          label="Work status"
          value={state.employment.status ?? ''}
          options={[
            '',
            'employed',
            'self_employed',
            'student',
            'seeking_work',
            'retired',
            'other',
          ]}
          onChange={(v) =>
            start({
              employment: {
                ...state.employment,
                status: v
                  ? (v as NonNullable<State['employment']['status']>)
                  : null,
              },
            })
          }
        />
        <Field
          label="Work domain"
          value={state.employment.workDomain}
          maxLength={160}
          onChange={(v) =>
            start({ employment: { ...state.employment, workDomain: blank(v) } })
          }
        />
        <Field
          label="Employer pseudonym"
          value={state.employment.employerLabel}
          maxLength={160}
          onChange={(v) =>
            start({
              employment: { ...state.employment, employerLabel: blank(v) },
            })
          }
        />
        <Field
          label="Country (two-letter code, e.g. US or DE)"
          value={state.location.country}
          maxLength={2}
          onChange={(v) =>
            start({
              location: { ...state.location, country: blank(v.toUpperCase()) },
            })
          }
        />
        <Field
          label="General region"
          value={state.location.region}
          maxLength={160}
          onChange={(v) =>
            start({ location: { ...state.location, region: blank(v) } })
          }
        />
        <Field
          label="Housing situation"
          value={state.location.housing}
          maxLength={160}
          onChange={(v) =>
            start({ location: { ...state.location, housing: blank(v) } })
          }
        />
        <Select
          label="Currency"
          value={state.finance.currency ?? ''}
          options={['', 'USD', 'EUR', 'HUF']}
          onChange={(v) =>
            start({
              finance: {
                ...state.finance,
                currency: v
                  ? (v as NonNullable<State['finance']['currency']>)
                  : null,
              },
            })
          }
        />
        <Field
          label="Monthly income (optional)"
          value={state.finance.monthlyIncome}
          type="number"
          min={0}
          onChange={(v) =>
            start({ finance: { ...state.finance, monthlyIncome: number(v) } })
          }
        />
        <Field
          label="Liquid funds (optional)"
          value={state.finance.liquidFunds}
          type="number"
          onChange={(v) =>
            start({ finance: { ...state.finance, liquidFunds: number(v) } })
          }
        />
        <Field
          label="Energy, 0–100 (optional)"
          value={state.resources.energy}
          type="number"
          min={0}
          max={100}
          onChange={(v) =>
            start({ resources: { ...state.resources, energy: number(v) } })
          }
        />
        <Field
          label="Available hours per week (optional)"
          value={state.resources.availableHoursPerWeek}
          type="number"
          min={0}
          max={168}
          onChange={(v) =>
            start({
              resources: {
                ...state.resources,
                availableHoursPerWeek: number(v),
              },
            })
          }
        />
        <TextList
          label="Skills (one per line, up to 50)"
          items={state.skills}
          onChange={(v) => start({ skills: v })}
        />
      </fieldset>
      <fieldset disabled={busy}>
        <legend>People, assets and opportunities</legend>
        <List
          title="Person"
          disabled={busy || state.actors.length >= 30}
          onAdd={() =>
            start({
              actors: [
                ...state.actors,
                {
                  key: nextKey('actor', state.actors),
                  label: '',
                  relationship: 'friend',
                },
              ],
            })
          }
        >
          {state.actors.map((a) => (
            <div key={a.key}>
              <Field
                label="Person pseudonym"
                value={a.label}
                required
                maxLength={160}
                onChange={(v) =>
                  start({
                    actors: state.actors.map((x) =>
                      x.key === a.key ? { ...x, label: v } : x,
                    ),
                  })
                }
              />
              <Select
                label="Relationship"
                value={a.relationship}
                options={['partner', 'family', 'friend', 'colleague', 'other']}
                onChange={(v) =>
                  start({
                    actors: state.actors.map((x) =>
                      x.key === a.key
                        ? { ...x, relationship: v as typeof a.relationship }
                        : x,
                    ),
                  })
                }
              />
              <button
                type="button"
                onClick={() =>
                  start({ actors: state.actors.filter((x) => x.key !== a.key) })
                }
              >
                Remove person
              </button>
            </div>
          ))}
        </List>
        <List
          title="Asset"
          disabled={busy || state.ownedAssets.length >= 30}
          onAdd={() =>
            start({
              ownedAssets: [
                ...state.ownedAssets,
                {
                  key: nextKey('asset', state.ownedAssets),
                  kind: 'other',
                  label: '',
                  sharePercent: 100,
                },
              ],
            })
          }
        >
          {state.ownedAssets.map((a) => (
            <div key={a.key}>
              <Field
                label="Asset label"
                value={a.label}
                required
                maxLength={160}
                onChange={(v) =>
                  start({
                    ownedAssets: state.ownedAssets.map((x) =>
                      x.key === a.key ? { ...x, label: v } : x,
                    ),
                  })
                }
              />
              <Select
                label="Asset type"
                value={a.kind}
                options={['business', 'home', 'other']}
                onChange={(v) =>
                  start({
                    ownedAssets: state.ownedAssets.map((x) =>
                      x.key === a.key ? { ...x, kind: v as typeof a.kind } : x,
                    ),
                  })
                }
              />
              <Field
                label="Ownership percent"
                value={a.sharePercent}
                type="number"
                min={0.01}
                max={100}
                required
                onChange={(v) =>
                  start({
                    ownedAssets: state.ownedAssets.map((x) =>
                      x.key === a.key ? { ...x, sharePercent: Number(v) } : x,
                    ),
                  })
                }
              />
              <button type="button" onClick={() => removeAsset(a.key)}>
                Remove asset and its conditions
              </button>
            </div>
          ))}
        </List>
        <List
          title="Opportunity"
          disabled={busy || state.opportunities.length >= 30}
          onAdd={() =>
            start({
              opportunities: [
                ...state.opportunities,
                {
                  key: nextKey('opportunity', state.opportunities),
                  title: '',
                  status: 'open',
                  expiresAt: null,
                },
              ],
            })
          }
        >
          {state.opportunities.map((o) => (
            <div key={o.key}>
              <Field
                label="Opportunity"
                value={o.title}
                required
                maxLength={160}
                onChange={(v) =>
                  start({
                    opportunities: state.opportunities.map((x) =>
                      x.key === o.key ? { ...x, title: v } : x,
                    ),
                  })
                }
              />
              <Select
                label="Opportunity status"
                value={o.status}
                options={['open', 'accepted', 'declined', 'expired']}
                onChange={(v) =>
                  start({
                    opportunities: state.opportunities.map((x) =>
                      x.key === o.key
                        ? { ...x, status: v as typeof o.status }
                        : x,
                    ),
                  })
                }
              />
              <Field
                label="Expiry date (optional)"
                value={o.expiresAt}
                type="date"
                onChange={(v) =>
                  start({
                    opportunities: state.opportunities.map((x) =>
                      x.key === o.key ? { ...x, expiresAt: blank(v) } : x,
                    ),
                  })
                }
              />
              <button
                type="button"
                onClick={() =>
                  start({
                    opportunities: state.opportunities.filter(
                      (x) => x.key !== o.key,
                    ),
                  })
                }
              >
                Remove opportunity
              </button>
            </div>
          ))}
        </List>
      </fieldset>
      <fieldset disabled={busy}>
        <legend>Your conditions</legend>
        <List
          title="Condition"
          disabled={busy || p.constraints.length >= 20}
          onAdd={() =>
            update({
              ...p,
              constraints: [
                ...p.constraints,
                {
                  key: nextKey('constraint', p.constraints),
                  description: '',
                  strength: 'soft',
                  scope: 'life',
                  validFrom: state.effectiveAt,
                  validUntil: null,
                  predicate: {
                    type: 'country_is',
                    value: state.location.country,
                  },
                },
              ],
            })
          }
        >
          {p.constraints.map((c) => {
            const change = (patch: Partial<typeof c>) =>
              update({
                ...p,
                constraints: p.constraints.map((x) =>
                  x.key === c.key ? { ...x, ...patch } : x,
                ),
              });
            return (
              <div key={c.key}>
                <Field
                  label="Condition description"
                  value={c.description}
                  required
                  maxLength={400}
                  onChange={(v) => change({ description: v })}
                />
                <Select
                  label="Required or preferred?"
                  value={c.strength}
                  options={['hard', 'soft']}
                  onChange={(v) => change({ strength: v as typeof c.strength })}
                />
                <Select
                  label="Applies to"
                  value={c.scope}
                  options={['life', 'branch']}
                  onChange={(v) => change({ scope: v as typeof c.scope })}
                />
                <Field
                  label="Condition starts"
                  value={c.validFrom}
                  type="date"
                  required
                  onChange={(v) => change({ validFrom: v })}
                />
                <Field
                  label="Condition ends (optional, exclusive)"
                  value={c.validUntil}
                  type="date"
                  onChange={(v) => change({ validUntil: blank(v) })}
                />
                <Select
                  label="Condition type"
                  value={c.predicate.type}
                  options={[
                    'country_is',
                    'employment_status_is',
                    'liquid_funds_at_least',
                    ...(state.ownedAssets.length ? ['asset_is_owned'] : []),
                  ]}
                  onChange={(v) =>
                    change({
                      predicate:
                        v === 'country_is'
                          ? { type: v, value: state.location.country }
                          : v === 'employment_status_is'
                            ? { type: v, value: state.employment.status }
                            : v === 'liquid_funds_at_least'
                              ? {
                                  type: v,
                                  currency: state.finance.currency ?? 'USD',
                                  amount: 0,
                                }
                              : {
                                  type: 'asset_is_owned',
                                  assetKey: state.ownedAssets[0]!.key,
                                  owned: true,
                                },
                    })
                  }
                />
                {c.predicate.type === 'country_is' && (
                  <Field
                    label="Required country (blank means unspecified)"
                    value={c.predicate.value}
                    maxLength={2}
                    onChange={(v) =>
                      change({
                        predicate: {
                          type: 'country_is',
                          value: blank(v.toUpperCase()),
                        },
                      })
                    }
                  />
                )}
                {c.predicate.type === 'employment_status_is' && (
                  <Select
                    label="Required work status"
                    value={c.predicate.value ?? ''}
                    options={[
                      '',
                      'employed',
                      'self_employed',
                      'student',
                      'seeking_work',
                      'retired',
                      'other',
                    ]}
                    onChange={(v) =>
                      change({
                        predicate: {
                          type: 'employment_status_is',
                          value: v
                            ? (v as NonNullable<State['employment']['status']>)
                            : null,
                        },
                      })
                    }
                  />
                )}
                {c.predicate.type === 'liquid_funds_at_least' && (
                  <>
                    <Select
                      label="Condition currency"
                      value={c.predicate.currency}
                      options={['USD', 'EUR', 'HUF']}
                      onChange={(v) =>
                        change({
                          predicate: {
                            type: 'liquid_funds_at_least',
                            currency: v as 'USD' | 'EUR' | 'HUF',
                            amount:
                              c.predicate.type === 'liquid_funds_at_least'
                                ? c.predicate.amount
                                : 0,
                          },
                        })
                      }
                    />
                    <Field
                      label="Minimum liquid funds"
                      value={c.predicate.amount}
                      type="number"
                      min={0}
                      required
                      onChange={(v) =>
                        change({
                          predicate: {
                            type: 'liquid_funds_at_least',
                            currency:
                              c.predicate.type === 'liquid_funds_at_least'
                                ? c.predicate.currency
                                : 'USD',
                            amount: Number(v),
                          },
                        })
                      }
                    />
                  </>
                )}
                {c.predicate.type === 'asset_is_owned' && (
                  <>
                    <label>
                      Referenced asset
                      <select
                        value={c.predicate.assetKey}
                        onChange={(e) =>
                          change({
                            predicate: {
                              type: 'asset_is_owned',
                              assetKey: e.target.value,
                              owned:
                                c.predicate.type === 'asset_is_owned'
                                  ? c.predicate.owned
                                  : true,
                            },
                          })
                        }
                      >
                        {state.ownedAssets.map((a) => (
                          <option key={a.key} value={a.key}>
                            {a.label || 'Unnamed asset'}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={c.predicate.owned}
                        onChange={(e) =>
                          change({
                            predicate: {
                              type: 'asset_is_owned',
                              assetKey:
                                c.predicate.type === 'asset_is_owned'
                                  ? c.predicate.assetKey
                                  : state.ownedAssets[0]!.key,
                              owned: e.target.checked,
                            },
                          })
                        }
                      />
                      Must remain owned (unchecked: must not be owned)
                    </label>
                  </>
                )}
                <button
                  type="button"
                  onClick={() =>
                    update({
                      ...p,
                      constraints: p.constraints.filter((x) => x.key !== c.key),
                    })
                  }
                >
                  Remove condition
                </button>
              </div>
            );
          })}
        </List>
      </fieldset>
      <fieldset disabled={busy}>
        <legend>Optional context</legend>
        <label>
          Anything else the simulation should take into account?
          <textarea
            value={p.context ?? ''}
            maxLength={contextLimit}
            onChange={(e) => update({ ...p, context: blank(e.target.value) })}
          />
        </label>
        <p>Up to {contextLimit} characters.</p>
      </fieldset>
      <label>
        <input
          type="checkbox"
          checked={ack}
          disabled={busy}
          onChange={(e) => setAck(e.target.checked)}
        />
        I approve these starting facts for a private preview. Preparing a
        preview does not start an AI story.
      </label>
      <button type="submit" disabled={busy || !ack}>
        Review my private starting point
      </button>
      {notice && <p role="alert">{notice}</p>}
    </form>
  );
}
