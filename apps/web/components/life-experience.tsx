'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  lifeSetupV2Schema,
  lifeDraftV2Schema,
  errorMessage,
  languages,
  type LifeSetupV2,
  type PeriodCandidateV2,
  type PeriodChapterV2,
  type LifeStateV2,
} from '@future-flow/contracts';
import { api, lifeApi, ClientError, clientErrorMessage } from '../lib/client';
import { lifeMessages } from '../lib/life-messages';
import { useLanguage } from './language-provider';
import { trackLife } from '../lib/life-analytics';

type Summary = {
  id: string;
  title: string;
  content_locale: 'en' | 'hu';
  root_branch_id: string;
  status: string;
};
type Detail = {
  branch: {
    id: string;
    revision: number;
    status: string;
    content_locale: 'en' | 'hu';
    state: LifeStateV2;
    pending_decision: PeriodCandidateV2['events'][number]['decision'];
  };
  periods: {
    id: string;
    position: number;
    candidate: PeriodCandidateV2;
    chapter: PeriodChapterV2;
    inherited: boolean;
  }[];
  branches: { id: string; name: string }[];
  choices: { decision_id: string; payload: { label: string } }[];
  job: { id: string; status: string; error_code: string | null } | null;
};
const defaultSetup: LifeSetupV2 = {
  locale: 'en',
  identity: { mode: 'self', label: null, ageBand: '25_34' },
  location: { country: 'HU', region: null, housing: null },
  employment: { status: null, employerLabel: null, workDomain: null },
  finance: { currency: null, monthlyIncome: null, liquidFunds: null },
  skills: [],
  relationships: [],
  resources: { energy: null, availableHoursPerWeek: null },
  goal: {
    category: 'career',
    description: '',
    horizonMonths: 60,
    motivation: null,
    acceptableTradeoffs: [],
    unacceptableTradeoffs: [],
  },
  stayInCountry: false,
  context: null,
};
function CommaInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (values: string[]) => void;
}) {
  const [text, setText] = useState(value.join(', '));
  return (
    <input
      value={text}
      maxLength={1500}
      onChange={(e) => {
        setText(e.target.value);
        onChange(
          e.target.value
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean),
        );
      }}
    />
  );
}
export function LifeExperience({
  page,
  id,
  user,
}: {
  page: string;
  id?: string;
  user: string | null;
}) {
  const { locale } = useLanguage(),
    m = lifeMessages[locale],
    router = useRouter();
  const [loading, setLoading] = useState(true),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const [list, setList] = useState<Summary[]>([]),
    [detail, setDetail] = useState<Detail | null>(null);
  const [setup, setSetup] = useState<LifeSetupV2>(
      structuredClone(defaultSetup),
    ),
    [step, setStep] = useState(0);
  const [consent, setConsent] = useState(false),
    [adult, setAdult] = useState(false),
    [ack, setAck] = useState(false),
    [saveStatus, setSaveStatus] = useState('');
  const revision = useRef(0),
    hydrated = useRef(false),
    saveBlocked = useRef(false),
    saveChain = useRef<Promise<void>>(Promise.resolve());
  const request = useRef<{ signature: string; key: string } | null>(null);
  const [tab, setTab] = useState<'story' | 'timeline'>('story');
  const readEnd = useRef<HTMLDivElement | null>(null),
    trackedStart = useRef(false);
  useEffect(() => {
    if (page === 'start' && consent && !loading && !trackedStart.current) {
      trackedStart.current = true;
      void trackLife('onboarding_started', null).catch(() => {});
    }
  }, [page, consent, loading]);
  useEffect(() => {
    if (detail?.branch.id)
      void trackLife('life_opened', detail.branch.id).catch(() => {});
  }, [detail?.branch.id]);
  useEffect(() => {
    if (!readEnd.current || !detail?.branch.id || tab !== 'story') return;
    const branchId = detail.branch.id;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        void trackLife('chapter_end_reached', branchId).catch(() => {});
      }
    });
    observer.observe(readEnd.current);
    return () => observer.disconnect();
  }, [detail?.periods.length, detail?.branch.id, tab]);
  const field = (title: string, element: ReactNode, help?: string) => (
    <label className="field">
      <span>{title}</span>
      {element}
      {help && <small>{help}</small>}
    </label>
  );
  const text = (
    value: string | null,
    onChange: (value: string | null) => void,
    max = 160,
  ) => (
    <input
      value={value ?? ''}
      maxLength={max}
      onChange={(e) => onChange(e.target.value || null)}
    />
  );
  const number = (
    value: number | null,
    onChange: (value: number | null) => void,
    min: number,
    max: number,
  ) => (
    <input
      type="number"
      value={value ?? ''}
      min={min}
      max={max}
      onChange={(e) =>
        onChange(e.target.value === '' ? null : Number(e.target.value))
      }
    />
  );
  async function loadDetail() {
    if (id) setDetail(await lifeApi<Detail>(`/branches/${id}`));
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    setNotice('');
    setDetail(null);
    hydrated.current = false;
    if (!user)
      return () => {
        active = false;
      };
    void (async () => {
      try {
        if (page === 'lives') {
          const data = await lifeApi<Summary[]>('/lives');
          if (active) setList(data);
        }
        if (page === 'life' && id) {
          const data = await lifeApi<Detail>(`/branches/${id}`);
          if (active) setDetail(data);
        }
        if (page === 'start') {
          const [profile, draft] = await Promise.all([
            api<{ acknowledged: boolean }>('/profile'),
            lifeApi<{ revision: number; payload: LifeSetupV2 | null }>(
              '/draft',
            ),
          ]);
          if (active) {
            setConsent(profile.acknowledged);
            revision.current = draft.revision;
            saveBlocked.current = false;
            let payload = draft.payload ?? structuredClone(defaultSetup);
            try {
              const raw = sessionStorage.getItem(`alterward.lifeDraft:${user}`);
              if (raw) {
                const cached = JSON.parse(raw) as {
                  revision: number;
                  payload: unknown;
                  step: number;
                };
                const parsed = lifeDraftV2Schema.safeParse(cached.payload);
                if (parsed.success && cached.revision === draft.revision) {
                  payload = parsed.data;
                  setStep(Math.max(0, Math.min(11, Number(cached.step) || 0)));
                } else if (
                  parsed.success &&
                  JSON.stringify(parsed.data) !== JSON.stringify(draft.payload)
                ) {
                  saveBlocked.current = true;
                  setNotice(
                    clientErrorMessage(
                      new ClientError('LIFE_REVISION_CONFLICT'),
                    ),
                  );
                }
              }
            } catch {
              /* Server draft remains available when browser storage is unavailable. */
            }
            setSetup(payload);
            hydrated.current = true;
          }
        }
      } catch (error) {
        if (active) setNotice(clientErrorMessage(error));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [page, id, user]);
  useEffect(() => {
    if (page !== 'life' || !id || detail?.branch.status !== 'generating')
      return;
    let cancelled = false;
    const timer = setInterval(() => {
      void lifeApi<Detail>(`/branches/${id}`)
        .then((data) => {
          if (!cancelled) setDetail(data);
        })
        .catch((error) => {
          if (!cancelled) setNotice(clientErrorMessage(error));
        });
    }, 2500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [page, id, detail?.branch.status]);
  function save(payload: LifeSetupV2): Promise<void> {
    const pending = saveChain.current.then(async () => {
      if (saveBlocked.current) throw new ClientError('LIFE_REVISION_CONFLICT');
      setSaveStatus('saving');
      try {
        const saved = await lifeApi<{ revision: number }>('/draft', {
          method: 'PATCH',
          body: JSON.stringify({ revision: revision.current, payload }),
        });
        revision.current = saved.revision;
        try {
          const raw = sessionStorage.getItem(`alterward.lifeDraft:${user}`);
          if (raw) {
            const cached = JSON.parse(raw);
            cached.revision = saved.revision;
            sessionStorage.setItem(
              `alterward.lifeDraft:${user}`,
              JSON.stringify(cached),
            );
          }
        } catch {
          /* Cloud save succeeded. */
        }
        setSaveStatus('saved');
      } catch (error) {
        saveBlocked.current =
          error instanceof ClientError &&
          error.code === 'LIFE_REVISION_CONFLICT';
        setSaveStatus('');
        throw error;
      }
    });
    saveChain.current = pending.catch(() => {});
    return pending;
  }
  useEffect(() => {
    if (page !== 'start' || !hydrated.current || !consent || loading) return;
    if (saveBlocked.current) return;
    try {
      sessionStorage.setItem(
        `alterward.lifeDraft:${user}`,
        JSON.stringify({ revision: revision.current, payload: setup, step }),
      );
    } catch {
      /* Cloud auto-save still runs. */
    }
    setSaveStatus('saving');
    if (!lifeDraftV2Schema.safeParse(setup).success) return;
    const timer = setTimeout(() => {
      void save(setup).catch((error) => setNotice(clientErrorMessage(error)));
    }, 800);
    return () => clearTimeout(timer);
  }, [page, setup, consent, loading, step, user]);
  async function act(run: () => Promise<void>) {
    setBusy(true);
    setNotice('');
    try {
      await run();
    } catch (error) {
      setNotice(clientErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function mutate(
    path: string,
    body: unknown,
  ): Promise<{ branchId: string; jobId?: string }> {
    const signature = JSON.stringify({ path, body });
    if (path.endsWith('/continue'))
      await trackLife('continuation_clicked', id ?? null).catch(() => {});
    if (path.endsWith('/fork'))
      await trackLife('fork_clicked', id ?? null).catch(() => {});
    if (request.current?.signature !== signature)
      request.current = { signature, key: crypto.randomUUID() };
    const result = await lifeApi<{ branchId: string; jobId?: string }>(path, {
      method: 'POST',
      headers: { 'Idempotency-Key': request.current.key },
      body: JSON.stringify(body),
    });
    request.current = null;
    return result;
  }
  if (!user) return null;
  if (loading)
    return (
      <div className="panel">
        <p>{m.loading}</p>
      </div>
    );
  const error = notice && (
    <div className="notice error" role="alert">
      {notice}
    </div>
  );
  if (page === 'lives')
    return (
      <>
        {error}
        <div className="page-head">
          <div>
            <div className="eyebrow">alterward</div>
            <h1>{m.lives}</h1>
            <p>{m.intro}</p>
          </div>
          <button className="primary" onClick={() => router.push('/start')}>
            {m.start}
          </button>
        </div>
        {!list.length && (
          <div className="panel">
            <p>{m.empty}</p>
          </div>
        )}
        <div className="card-grid">
          {list.map((life) => (
            <button
              className="panel life-card"
              key={life.id}
              onClick={() => router.push(`/life/${life.root_branch_id}`)}
            >
              <small>{languages[life.content_locale].nativeName}</small>
              <h2 lang={life.content_locale}>{life.title}</h2>
              <p>{m.private}</p>
            </button>
          ))}
        </div>
        <button className="text-button" onClick={() => router.push('/futures')}>
          {m.legacy}
        </button>
      </>
    );
  if (page === 'start') {
    if (!consent)
      return (
        <div className="panel narrow">
          {error}
          <h1>{m.consent}</h1>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={adult}
              onChange={(e) => setAdult(e.target.checked)}
            />
            {m.adult}
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            {m.ack}
          </label>
          <button
            className="primary"
            disabled={!adult || !ack || busy}
            onClick={() =>
              void act(async () => {
                await api('/me/consent', {
                  method: 'POST',
                  body: JSON.stringify({ adult, acknowledged: ack }),
                });
                setConsent(true);
              })
            }
          >
            {m.accept}
          </button>
        </div>
      );
    const titles = [
      m.identity,
      m.age,
      m.location,
      m.employment,
      m.work,
      m.finance,
      m.skills,
      m.relationships,
      m.resources,
      m.goal,
      m.tradeoffs,
      m.constraints,
    ];
    const identity = (patch: Partial<LifeSetupV2['identity']>) =>
      setSetup((s) => ({ ...s, identity: { ...s.identity, ...patch } }));
    const goal = (patch: Partial<LifeSetupV2['goal']>) =>
      setSetup((s) => ({ ...s, goal: { ...s.goal, ...patch } }));
    return (
      <div className="panel narrow">
        {error}
        <div className="eyebrow">
          {step + 1} / 12 · {m.private}
        </div>
        <progress value={step + 1} max={12} aria-label={`${step + 1} / 12`} />
        <h1>{titles[step]}</h1>
        <div className="form-grid">
          {step === 0 && (
            <>
              {field(
                m.identity,
                <select
                  value={setup.identity.mode}
                  onChange={(e) =>
                    identity({ mode: e.target.value as 'self' | 'alternate' })
                  }
                >
                  <option value="self">{m.self}</option>
                  <option value="alternate">{m.alternate}</option>
                </select>,
              )}
              {field(
                m.label,
                text(setup.identity.label, (label) => identity({ label })),
              )}
            </>
          )}
          {step === 1 &&
            field(
              m.age,
              <select
                value={setup.identity.ageBand}
                onChange={(e) =>
                  identity({
                    ageBand: e.target
                      .value as LifeSetupV2['identity']['ageBand'],
                  })
                }
              >
                {['18_24', '25_34', '35_44', '45_54', '55_64', '65_plus'].map(
                  (band) => (
                    <option key={band} value={band}>
                      {band.replace('_', '–').replace('plus', '+')}
                    </option>
                  ),
                )}
              </select>,
            )}
          {step === 2 && (
            <>
              {field(
                m.country,
                <input
                  value={setup.location.country ?? ''}
                  maxLength={2}
                  onChange={(e) =>
                    setSetup((s) => ({
                      ...s,
                      location: {
                        ...s.location,
                        country: e.target.value.toUpperCase() || null,
                      },
                    }))
                  }
                />,
              )}
              {field(
                m.region,
                text(setup.location.region, (region) =>
                  setSetup((s) => ({
                    ...s,
                    location: { ...s.location, region },
                  })),
                ),
              )}
              {field(
                m.housing,
                text(setup.location.housing, (housing) =>
                  setSetup((s) => ({
                    ...s,
                    location: { ...s.location, housing },
                  })),
                ),
              )}
            </>
          )}
          {step === 3 &&
            field(
              m.employment,
              <select
                value={setup.employment.status ?? ''}
                onChange={(e) =>
                  setSetup((s) => ({
                    ...s,
                    employment: {
                      ...s.employment,
                      status: (e.target.value ||
                        null) as LifeSetupV2['employment']['status'],
                    },
                  }))
                }
              >
                <option value="">{m.unknown}</option>
                {(
                  [
                    'employed',
                    'self_employed',
                    'student',
                    'seeking_work',
                    'retired',
                    'other',
                  ] as const
                ).map((status) => (
                  <option key={status} value={status}>
                    {m[status]}
                  </option>
                ))}
              </select>,
            )}
          {step === 4 && (
            <>
              {field(
                m.workDomain,
                text(setup.employment.workDomain, (workDomain) =>
                  setSetup((s) => ({
                    ...s,
                    employment: { ...s.employment, workDomain },
                  })),
                ),
              )}
              {field(
                m.employer,
                text(setup.employment.employerLabel, (employerLabel) =>
                  setSetup((s) => ({
                    ...s,
                    employment: { ...s.employment, employerLabel },
                  })),
                ),
              )}
            </>
          )}
          {step === 5 && (
            <>
              <p>{m.moneyNote}</p>
              {field(
                m.currency,
                <select
                  value={setup.finance.currency ?? ''}
                  onChange={(e) =>
                    setSetup((s) => ({
                      ...s,
                      finance: {
                        ...s.finance,
                        currency: (e.target.value ||
                          null) as LifeSetupV2['finance']['currency'],
                      },
                    }))
                  }
                >
                  <option value="">{m.unknown}</option>
                  {['HUF', 'EUR', 'USD'].map((currency) => (
                    <option key={currency}>{currency}</option>
                  ))}
                </select>,
              )}
              {field(
                m.income,
                number(
                  setup.finance.monthlyIncome,
                  (monthlyIncome) =>
                    setSetup((s) => ({
                      ...s,
                      finance: { ...s.finance, monthlyIncome },
                    })),
                  0,
                  1e10,
                ),
              )}
              {field(
                m.funds,
                number(
                  setup.finance.liquidFunds,
                  (liquidFunds) =>
                    setSetup((s) => ({
                      ...s,
                      finance: { ...s.finance, liquidFunds },
                    })),
                  -1e10,
                  1e10,
                ),
              )}
            </>
          )}
          {step === 6 &&
            field(
              m.skills,
              <CommaInput
                value={setup.skills}
                onChange={(skills) => setSetup((s) => ({ ...s, skills }))}
              />,
              m.skillsHelp,
            )}
          {step === 7 &&
            field(
              m.relationships,
              <CommaInput
                value={setup.relationships.map((r) => r.label)}
                onChange={(labels) =>
                  setSetup((s) => ({
                    ...s,
                    relationships: labels.map((label) => ({
                      label,
                      relationship: 'friend',
                    })),
                  }))
                }
              />,
              m.relationshipsHelp,
            )}
          {step === 8 && (
            <>
              {field(
                m.hours,
                number(
                  setup.resources.availableHoursPerWeek,
                  (availableHoursPerWeek) =>
                    setSetup((s) => ({
                      ...s,
                      resources: { ...s.resources, availableHoursPerWeek },
                    })),
                  0,
                  168,
                ),
              )}
              {field(
                m.energy,
                number(
                  setup.resources.energy,
                  (energy) =>
                    setSetup((s) => ({
                      ...s,
                      resources: { ...s.resources, energy },
                    })),
                  0,
                  100,
                ),
              )}
            </>
          )}
          {step === 9 && (
            <>
              {field(
                m.category,
                <select
                  value={setup.goal.category}
                  onChange={(e) =>
                    goal({
                      category: e.target
                        .value as LifeSetupV2['goal']['category'],
                    })
                  }
                >
                  {(
                    [
                      'career',
                      'business',
                      'finance',
                      'relationships',
                      'family',
                      'education',
                      'lifestyle',
                      'personal_growth',
                      'other',
                    ] as const
                  ).map((category) => (
                    <option key={category} value={category}>
                      {
                        m[
                          category === 'finance'
                            ? 'financial'
                            : category === 'relationships'
                              ? 'relationship'
                              : category
                        ]
                      }
                    </option>
                  ))}
                </select>,
              )}
              {field(
                m.description,
                <textarea
                  value={setup.goal.description}
                  maxLength={500}
                  onChange={(e) => goal({ description: e.target.value })}
                />,
              )}
            </>
          )}
          {step === 10 && (
            <>
              {field(
                m.horizon,
                number(
                  setup.goal.horizonMonths,
                  (horizonMonths) =>
                    goal({ horizonMonths: horizonMonths ?? 6 }),
                  6,
                  600,
                ),
              )}
              {field(
                m.motivation,
                text(
                  setup.goal.motivation,
                  (motivation) => goal({ motivation }),
                  500,
                ),
              )}
              {field(
                m.acceptable,
                <CommaInput
                  value={setup.goal.acceptableTradeoffs}
                  onChange={(acceptableTradeoffs) =>
                    goal({ acceptableTradeoffs })
                  }
                />,
              )}
              {field(
                m.unacceptable,
                <CommaInput
                  value={setup.goal.unacceptableTradeoffs}
                  onChange={(unacceptableTradeoffs) =>
                    goal({ unacceptableTradeoffs })
                  }
                />,
              )}
            </>
          )}
          {step === 11 && (
            <>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={setup.stayInCountry}
                  onChange={(e) =>
                    setSetup((s) => ({ ...s, stayInCountry: e.target.checked }))
                  }
                />
                {m.stay}
              </label>
              {field(
                m.context,
                <textarea
                  value={setup.context ?? ''}
                  maxLength={1000}
                  onChange={(e) =>
                    setSetup((s) => ({ ...s, context: e.target.value || null }))
                  }
                />,
              )}
              <p>
                {m.review}: {setup.goal.description || m.description} ·{' '}
                {languages[locale].nativeName}
              </p>
            </>
          )}
        </div>
        <div className="hero-actions">
          <button
            disabled={step === 0 || busy}
            className="secondary"
            onClick={() =>
              void act(async () => {
                await save(setup);
                setStep((s) => s - 1);
              })
            }
          >
            {m.back}
          </button>
          {step < 11 ? (
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await save(setup);
                  setStep((s) => s + 1);
                })
              }
            >
              {m.next}
            </button>
          ) : (
            <button
              className="primary"
              disabled={busy || saveBlocked.current}
              onClick={() =>
                void act(async () => {
                  const parsed = lifeSetupV2Schema.safeParse({
                    ...setup,
                    locale,
                  });
                  if (!parsed.success)
                    throw new ClientError('VALIDATION_FAILED');
                  await save(parsed.data);
                  const created = await mutate('/lives', parsed.data);
                  router.push(`/life/${created.branchId}`);
                })
              }
            >
              {m.create}
            </button>
          )}
        </div>
        <div aria-live="polite" className="subtle">
          {saveStatus === 'saving'
            ? m.saving
            : saveStatus === 'saved'
              ? m.saved
              : ''}
        </div>
        {saveBlocked.current && (
          <button
            className="text-button"
            onClick={() => {
              sessionStorage.removeItem(`alterward.lifeDraft:${user}`);
              window.location.reload();
            }}
          >
            {m.reload}
          </button>
        )}
      </div>
    );
  }
  if (!detail)
    return (
      <div className="panel">
        {error}
        <button className="secondary" onClick={() => void act(loadDetail)}>
          {m.reload}
        </button>
      </div>
    );
  const b = detail.branch;
  const choose = async (decisionId: string, optionId: string) => {
    await mutate(`/branches/${b.id}/choice`, {
      revision: b.revision,
      decisionId,
      optionId,
    });
    await loadDetail();
  };
  return (
    <>
      {error}
      <div className="page-head">
        <div>
          <div className="eyebrow">
            {m.private} · {languages[b.content_locale].nativeName}
          </div>
          <h1>{detail.periods.at(-1)?.chapter.title ?? m.waiting}</h1>
        </div>
        <button className="secondary" onClick={() => router.push('/lives')}>
          {m.lives}
        </button>
      </div>
      <div className="tabs">
        <button
          className={tab === 'story' ? 'active' : ''}
          onClick={() => setTab('story')}
        >
          {m.story}
        </button>
        <button
          className={tab === 'timeline' ? 'active' : ''}
          onClick={() => setTab('timeline')}
        >
          {m.timeline}
        </button>
      </div>
      <div className="chips">
        {detail.branches.map((branch) => (
          <button
            key={branch.id}
            className={`chip ${branch.id === b.id ? 'selected' : ''}`}
            onClick={() => router.push(`/life/${branch.id}`)}
          >
            {branch.name}
          </button>
        ))}
      </div>
      {b.status === 'generating' && (
        <div className="panel" role="status">
          <h2>{m.waiting}</h2>
          <p>{m.generationHint}</p>
        </div>
      )}
      {b.status === 'failed' && (
        <div className="notice error">
          <p>
            {m.failed}{' '}
            {errorMessage(locale, detail.job?.error_code ?? 'JOB_FAILED')}
          </p>
          {detail.job && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await mutate(`/jobs/${detail.job!.id}/retry`, {
                    revision: b.revision,
                  });
                  await loadDetail();
                })
              }
            >
              {m.retry}
            </button>
          )}
        </div>
      )}
      {detail.periods.map((period) => {
        const d = period.candidate.events.at(-1)!.decision!,
          chosen = detail.choices.find((c) => c.decision_id === d.id);
        return (
          <article
            key={period.id}
            className="chapter panel"
            lang={b.content_locale}
          >
            <div className="eyebrow">
              {m.period} {period.position} · {period.candidate.startDate} —{' '}
              {period.candidate.endDate}
            </div>
            <h2>{period.chapter.title}</h2>
            {tab === 'story' ? (
              <div className="prose">
                {period.chapter.body.split(/\n\s*\n/).map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
              </div>
            ) : (
              <ol className="life-timeline">
                {period.candidate.events.map((event) => (
                  <li key={event.id}>
                    <small>{event.effectiveAt}</small>
                    <h3>{event.title}</h3>
                    <p>{event.summary}</p>
                  </li>
                ))}
              </ol>
            )}
            {period.position === 1 && tab === 'story' && (
              <div ref={readEnd} aria-hidden="true" style={{ height: 1 }} />
            )}
            {chosen && (
              <p>
                <strong>{m.chosen}:</strong> {chosen.payload.label}
              </p>
            )}
            {b.pending_decision?.id === d.id ? (
              <div className="decision">
                <h3>{d.prompt}</h3>
                {d.options.map((option) => (
                  <button
                    key={option.id}
                    className="option"
                    disabled={busy}
                    onClick={() => void act(() => choose(d.id, option.id))}
                  >
                    <strong>{option.label}</strong>
                    <span>{option.description}</span>
                    <small>{m.choose}</small>
                  </button>
                ))}
              </div>
            ) : (
              <details>
                <summary>{m.fork}</summary>
                <p>{m.forkHelp}</p>
                {d.options.map((option) => (
                  <button
                    key={option.id}
                    className="option"
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        const fork = await mutate(
                          `/branches/${b.id}/periods/${period.id}/fork`,
                          { revision: b.revision, optionId: option.id },
                        );
                        router.push(`/life/${fork.branchId}`);
                      })
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </details>
            )}
          </article>
        );
      })}
      {b.status === 'ready' && (
        <button
          className="primary"
          disabled={busy}
          onClick={() =>
            void act(async () => {
              await mutate(`/branches/${b.id}/continue`, {
                revision: b.revision,
              });
              await loadDetail();
            })
          }
        >
          {m.continue}
        </button>
      )}
    </>
  );
}
