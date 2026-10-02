'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  ArrowRight,
  GitBranch,
  ShieldCheck,
  Sparkles,
  Compass,
  BookOpen,
  Check,
  Lock,
  Download,
  LogOut,
  Plus,
} from 'lucide-react';
import {
  questionnaire,
  type Question,
  type Profile,
  type CandidateEvent,
  type ChapterOutput,
  type LifeState,
} from '@future-flow/contracts';
import { api, authConfigured, supabase } from '../lib/client';

type Answers = Record<string, string | number | boolean | string[]>;
type Version = { id: string; version_no: number; snapshot: Profile };
type ProfileResponse = {
  current: Version | null;
  acknowledged: boolean;
  draft: {
    revision: number;
    answers: Answers;
    relationships: Profile['relationships'];
  };
};
type FutureCard = {
  id: string;
  title: string;
  status: string;
  root_branch_id: string;
  created_at: string;
  job_id: string | null;
};
type EventRow = {
  id: string;
  effective_at: string;
  inherited?: boolean;
  canon: CandidateEvent & { stateAfter: LifeState };
};
type Decision = {
  id: string;
  event_id: string;
  prompt: string;
  options: { id: string; payload: { label: string; description: string } }[];
};
type Branch = {
  id: string;
  future_id: string;
  name: string;
  status: string;
  job_id: string | null;
  parent_branch_id: string | null;
  events: EventRow[];
  chapters: { id: string; payload: ChapterOutput['chapters'][number] }[];
  decisions: Decision[];
};
type Future = {
  id: string;
  profile_version_id: string;
  branches: {
    id: string;
    name: string;
    status: string;
    job_id: string | null;
  }[];
};
type Job = {
  id: string;
  branch_id: string;
  status: string;
  stage: string;
  error_message_safe: string | null;
};
const sections = [
  'Élethelyzet',
  'Munka és biztonság',
  'Habitus',
  'Irányok és kapcsolatok',
  'Összegzés',
];
const message = (error: unknown) =>
  error instanceof Error ? error.message : 'A művelet nem sikerült.';

export function Experience() {
  const router = useRouter(),
    pathname = usePathname();
  const [route, id] = pathname.split('/').filter(Boolean);
  const page = route ?? 'home';
  const [user, setUser] = useState<string | null>(null),
    [authReady, setAuthReady] = useState(false);
  const [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [signup, setSignup] = useState(false);
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState('');
  const [adult, setAdult] = useState(false),
    [acknowledged, setAcknowledged] = useState(false);
  const [step, setStep] = useState(0),
    [answers, setAnswers] = useState<Answers>({}),
    [relationships, setRelationships] = useState<Profile['relationships']>([]),
    [revision, setRevision] = useState(0);
  const [version, setVersion] = useState<Version | null>(null),
    [futures, setFutures] = useState<FutureCard[]>([]);
  const [branch, setBranch] = useState<Branch | null>(null),
    [future, setFuture] = useState<Future | null>(null),
    [job, setJob] = useState<Job | null>(null);
  const [tab, setTab] = useState<'story' | 'timeline' | 'compare'>('story'),
    [compareBranch, setCompareBranch] = useState<Branch | null>(null),
    [confirmation, setConfirmation] = useState('');
  const futureRequest = useRef<{
    snapshot: string;
    profileVersionId: string;
    key: string;
  } | null>(null);
  const decisionRequest = useRef<{
    decisionId: string;
    optionId: string;
    key: string;
  } | null>(null);
  const navigate = (path: string) => {
    setNotice('');
    router.push(path);
  };
  useEffect(() => {
    if (!authConfigured) {
      setAuthReady(true);
      return;
    }
    const auth = supabase().auth;
    void auth.getSession().then(({ data }) => {
      setUser(data.session?.user.email ?? null);
      setAuthReady(true);
    });
    const { data } = auth.onAuthStateChange((_event, session) => {
      setUser(session?.user.email ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    setNotice('');
    setBranch(null);
    setJob(null);
    setCompareBranch(null);
    if (!user) return;
    let cancelled = false;
    async function load() {
      try {
        if (page === 'onboarding' || page === 'profile') {
          const data = await api<ProfileResponse>('/profile');
          if (cancelled) return;
          setAnswers(data.draft.answers);
          setRelationships(data.draft.relationships);
          setRevision(data.draft.revision);
          setVersion(data.current);
          setAdult(data.acknowledged);
          setAcknowledged(data.acknowledged);
          setStep(0);
        }
        if (page === 'futures') {
          const data = await api<FutureCard[]>('/futures');
          if (!cancelled) setFutures(data);
        }
        if (page === 'branch' && id) {
          const data = await api<Branch>(`/branches/${id}`);
          if (cancelled) return;
          setBranch(data);
          const owner = await api<Future>(`/futures/${data.future_id}`);
          if (!cancelled) setFuture(owner);
        }
      } catch (error) {
        if (!cancelled) setNotice(message(error));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [page, id, user]);
  useEffect(() => {
    if (page !== 'job' || !id || !user) return;
    let cancelled = false,
      pending = false;
    async function poll() {
      if (pending) return;
      pending = true;
      try {
        const data = await api<Job>(`/jobs/${id}`);
        if (cancelled) return;
        setJob(data);
        if (data.status === 'completed')
          router.replace(`/branch/${data.branch_id}`);
      } catch (error) {
        if (!cancelled) setNotice(message(error));
      } finally {
        pending = false;
      }
    }
    void poll();
    const interval = setInterval(() => {
      void poll();
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [page, id, user, router]);
  async function action(run: () => Promise<void>) {
    setBusy(true);
    setNotice('');
    try {
      await run();
    } catch (error) {
      setNotice(message(error));
    } finally {
      setBusy(false);
    }
  }
  async function login(event: FormEvent) {
    event.preventDefault();
    await action(async () => {
      if (signup) {
        const { data, error } = await supabase().auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + '/login' },
        });
        if (error) throw error;
        if (!data.session) {
          setNotice(
            'Elküldtük a megerősítő e-mailt. A megerősítés után jelentkezz be.',
          );
          return;
        }
      } else {
        const { error } = await supabase().auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
      setPassword('');
      navigate('/onboarding');
    });
  }
  async function save() {
    await api('/me/consent', {
      method: 'POST',
      body: JSON.stringify({ adult, acknowledged }),
    });
    const saved = await api<{ revision: number }>('/profile/draft', {
      method: 'PATCH',
      body: JSON.stringify({
        revision,
        answers,
        relationships:
          answers.noCloseRelationships === true ? [] : relationships,
      }),
    });
    setRevision(saved.revision);
    return saved.revision;
  }
  async function nextStep() {
    await action(async () => {
      await save();
      setStep((value) => Math.min(value + 1, 4));
    });
  }
  async function createFuture() {
    await action(async () => {
      const snapshot = JSON.stringify({
        answers,
        relationships:
          answers.noCloseRelationships === true ? [] : relationships,
      });
      if (futureRequest.current?.snapshot !== snapshot) {
        const saved = await save();
        const committed = await api<{
          profileVersionId: string;
          version: number;
          profile: Profile;
        }>('/profile/draft/commit', {
          method: 'POST',
          body: JSON.stringify({ revision: saved }),
        });
        setVersion({
          id: committed.profileVersionId,
          version_no: committed.version,
          snapshot: committed.profile,
        });
        futureRequest.current = {
          snapshot,
          profileVersionId: committed.profileVersionId,
          key: crypto.randomUUID(),
        };
      }
      const request = futureRequest.current!;
      const generated = await api<{ jobId: string }>('/futures', {
        method: 'POST',
        headers: { 'Idempotency-Key': request.key },
        body: JSON.stringify({
          profileVersionId: request.profileVersionId,
          horizonYears: 10,
          mode: 'baseline',
        }),
      });
      futureRequest.current = null;
      navigate(`/job/${generated.jobId}`);
    });
  }
  async function resolve(decisionId: string, optionId: string) {
    await action(async () => {
      if (
        decisionRequest.current?.decisionId !== decisionId ||
        decisionRequest.current?.optionId !== optionId
      )
        decisionRequest.current = {
          decisionId,
          optionId,
          key: crypto.randomUUID(),
        };
      const created = await api<{ jobId: string }>(
        `/decisions/${decisionId}/resolve`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': decisionRequest.current.key },
          body: JSON.stringify({ type: 'option', optionId }),
        },
      );
      decisionRequest.current = null;
      navigate(`/job/${created.jobId}`);
    });
  }
  function questionField(question: Question) {
    const value = answers[question.key];
    const update = (answer: string | number | boolean | string[]) => {
      setAnswers((current) => ({ ...current, [question.key]: answer }));
    };
    return (
      <label
        className={`field ${question.type === 'ranking' ? 'wide' : ''}`}
        key={question.key}
      >
        <span>{question.label}</span>
        {question.type === 'select' && (
          <select
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => update(e.target.value)}
          >
            <option value="">Válassz…</option>
            {question.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}
        {question.type === 'text' && (
          <input
            value={typeof value === 'string' ? value : ''}
            maxLength={
              question.key === 'region' || question.key === 'workDomain'
                ? 80
                : 160
            }
            onChange={(e) => update(e.target.value)}
            placeholder={
              question.key === 'goalTitle' ? 'Például: új szakmát tanulni' : ''
            }
          />
        )}
        {question.type === 'number' && (
          <input
            type="number"
            min={0}
            max={15}
            value={typeof value === 'number' ? value : ''}
            onChange={(e) => {
              if (e.target.value !== '') update(Number(e.target.value));
            }}
          />
        )}
        {question.type === 'scale' && (
          <>
            <input
              aria-label={question.label}
              type="range"
              min={0}
              max={100}
              value={typeof value === 'number' ? value : 50}
              onChange={(e) => update(Number(e.target.value))}
            />
            <div className="range-labels">
              <span>Alacsony</span>
              <span>
                {typeof value === 'number'
                  ? `${value} / 100`
                  : 'Még nincs válasz'}
              </span>
              <span>Magas</span>
            </div>
            {value === undefined && (
              <button
                type="button"
                className="text-button"
                onClick={() => update(50)}
              >
                Közepes értéket választok
              </button>
            )}
          </>
        )}
        {question.type === 'boolean' && (
          <div className="checkbox">
            <input
              type="checkbox"
              checked={value === true}
              onChange={(e) => update(e.target.checked)}
            />
            <span>Igen</span>
            <button
              type="button"
              className="text-button"
              onClick={() => update(false)}
            >
              Van legalább két fontos kapcsolatom
            </button>
          </div>
        )}
        {question.type === 'ranking' && (
          <div className="chips">
            {question.options?.map((option) => {
              const selected = Array.isArray(value) ? value : [];
              const rank = selected.indexOf(option.value);
              return (
                <button
                  type="button"
                  key={option.value}
                  className={`chip ${rank >= 0 ? 'selected' : ''}`}
                  onClick={() => {
                    if (rank >= 0)
                      update(selected.filter((item) => item !== option.value));
                    else if (selected.length < 5)
                      update([...selected, option.value]);
                  }}
                >
                  {rank >= 0 ? `${rank + 1}. ` : ''}
                  {option.label}
                </button>
              );
            })}
          </div>
        )}
        {question.help && <small>{question.help}</small>}
      </label>
    );
  }
  const decisionPanel = (decision: Decision) => (
    <div className="decision" key={decision.id}>
      <div className="eyebrow">A következő döntés a tiéd</div>
      <h3>{decision.prompt}</h3>
      {decision.options.map((option) => (
        <button
          className="option"
          key={option.id}
          disabled={busy}
          onClick={() => {
            void resolve(decision.id, option.id);
          }}
        >
          {option.payload.label}
          <small>{option.payload.description}</small>
        </button>
      ))}
      <p className="subtle" style={{ marginTop: 15 }}>
        Minden választás új életágat nyit. Később másik lehetőséget is
        kipróbálhatsz.
      </p>
    </div>
  );
  const completedQuestions = questionnaire.questions.filter(
    (q) => answers[q.key] !== undefined && answers[q.key] !== '',
  ).length;
  const protectedPage = [
    'onboarding',
    'profile',
    'futures',
    'branch',
    'job',
    'settings',
  ].includes(page);
  return (
    <>
      <header>
        <button className="brand" onClick={() => navigate('/')}>
          <span className="brand-icon">
            <GitBranch size={23} />
          </span>
          alter jövő
          <span
            style={{
              fontSize: 10,
              letterSpacing: 1,
              color: '#889280',
              alignSelf: 'start',
              marginTop: 3,
            }}
          >
            ALPHA
          </span>
        </button>
        <nav className="nav" aria-label="Fő navigáció">
          <button
            className={page === 'futures' ? 'active' : ''}
            onClick={() => navigate(user ? '/futures' : '/login')}
          >
            Életágaim
          </button>
          <button
            className={page === 'onboarding' ? 'active' : ''}
            onClick={() => navigate(user ? '/onboarding' : '/login')}
          >
            Profilom
          </button>
          <button onClick={() => navigate('/privacy')}>Adatvédelem</button>
          {user ? (
            <button
              className="login"
              onClick={() => {
                void action(async () => {
                  await supabase().auth.signOut();
                  navigate('/');
                });
              }}
              aria-label="Kijelentkezés"
            >
              <LogOut size={15} />
            </button>
          ) : (
            <button className="login" onClick={() => navigate('/login')}>
              Belépés <ArrowUpRight size={12} />
            </button>
          )}
        </nav>
      </header>
      <main className="shell">
        {notice && (
          <div role="alert" className="notice error">
            {notice}
          </div>
        )}
        {protectedPage && authReady && !user ? (
          <div className="panel narrow">
            <Lock color="#2d6347" />
            <h1>A történeted privát.</h1>
            <p>
              Jelentkezz be, hogy folytathasd a profilodat és megnyithasd az
              életágaidat.
            </p>
            <button className="primary" onClick={() => navigate('/login')}>
              Bejelentkezés <ArrowRight size={16} />
            </button>
          </div>
        ) : (
          <>
            {page === 'home' && (
              <>
                <section className="hero">
                  <div>
                    <div className="eyebrow">A jövő nincs kőbe vésve</div>
                    <h1>
                      Egy élet.
                      <br />
                      Több <em>lehetőség.</em>
                    </h1>
                    <p className="intro">
                      Mi történhetne, ha más irányt választanál? Fedezz fel
                      személyes, AI által alkotott életutakat — és írd tovább a
                      saját döntéseiddel.
                    </p>
                    <div className="hero-actions">
                      <button
                        className="primary"
                        onClick={() =>
                          navigate(user ? '/onboarding' : '/login')
                        }
                      >
                        Felfedezem a jövőmet <ArrowUpRight size={17} />
                      </button>
                      <button
                        className="text-button"
                        onClick={() =>
                          document
                            .getElementById('how')
                            ?.scrollIntoView({ behavior: 'smooth' })
                        }
                      >
                        Hogyan működik? <ArrowRight size={13} />
                      </button>
                    </div>
                    <div className="fineprint">
                      <Lock size={12} /> Privát történet · Saját döntések · 18
                      év felett
                    </div>
                  </div>
                  <div
                    className="orbit"
                    aria-label="Elágazó életutak szemléltetése"
                  >
                    <span className="illustration-label">
                      EGY KIINDULÓPONT · TÖBB IRÁNY
                    </span>
                    <svg
                      className="tree"
                      viewBox="0 0 500 500"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M325 463 C310 385 252 380 249 292 C247 226 159 226 126 143"
                        stroke="#668960"
                        strokeWidth="2"
                      />
                      <path
                        d="M249 292 C285 232 346 286 374 225"
                        stroke="#759a66"
                        strokeWidth="2"
                      />
                      <path
                        d="M272 366 C220 351 180 361 136 355"
                        stroke="#91aa7f"
                        strokeWidth="2"
                        strokeDasharray="5 6"
                      />
                      <circle cx="249" cy="292" r="7" fill="#2d6347" />
                      <circle cx="126" cy="143" r="4" fill="#2d6347" />
                      <circle cx="374" cy="225" r="4" fill="#2d6347" />
                      <circle cx="136" cy="355" r="4" fill="#2d6347" />
                    </svg>
                    <div className="path-card one">
                      <small>ÚJ IRÁNY</small>
                      <h3>Egy másik város.</h3>
                      <p>
                        Egy lehetőség új környezetben, a megszokott élet
                        határán.
                      </p>
                    </div>
                    <div className="path-card two">
                      <small>EGY RÉGI ÖTLET</small>
                      <h3>Valami saját.</h3>
                      <p>A félretett terved lassan valódi formát kap.</p>
                    </div>
                    <div className="path-card three">
                      <small>A JELENBŐL ÉPÍTVE</small>
                      <h3>Apró változások.</h3>
                      <p>Ugyanaz a kiindulópont. Egy egészen más ritmus.</p>
                    </div>
                    <div className="root-node">
                      <Compass size={14} /> A te jelened
                    </div>
                  </div>
                </section>
                <section className="principles" id="how">
                  <div className="principle">
                    <Compass size={22} />
                    <div>
                      <h3>Belőled indul ki</h3>
                      <p>
                        Élethelyzeted, értékeid és céljaid adják a történet
                        alapját.
                      </p>
                    </div>
                  </div>
                  <div className="principle">
                    <GitBranch size={22} />
                    <div>
                      <h3>Te választod az irányt</h3>
                      <p>
                        Egy döntés új ágat nyit. A korábbi lehetőségekhez is
                        visszatérhetsz.
                      </p>
                    </div>
                  </div>
                  <div className="principle">
                    <ShieldCheck size={22} />
                    <div>
                      <h3>A történeted a tiéd</h3>
                      <p>
                        Privát alapállapot. Az életágak lehetséges
                        forgatókönyvek.
                      </p>
                    </div>
                  </div>
                </section>
                <p className="subtle" style={{ marginTop: 30 }}>
                  Az illusztráció példalehetőségeket szemléltet. A személyes
                  életágadat az AI a profilod alapján készíti el.
                </p>
              </>
            )}
            {page === 'login' && (
              <section className="panel narrow">
                <div className="eyebrow">A történeted itt kezdődik</div>
                <h1>{signup ? 'Kezdj egy új életágat.' : 'Üdv újra.'}</h1>
                <p>
                  {signup
                    ? 'Hozd létre a fiókodat, és fedezd fel, merre indulhatnál.'
                    : 'Lépj be a személyes történetedhez.'}
                </p>
                {!authConfigured ? (
                  <div className="notice">
                    A belépés előkészítés alatt áll. A szolgáltatás a
                    Supabase-projekt beállítása után indul.
                  </div>
                ) : (
                  <form
                    onSubmit={(event) => {
                      void login(event);
                    }}
                  >
                    <label className="field">
                      <span>E-mail</span>
                      <input
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span>Jelszó</span>
                      <input
                        type="password"
                        minLength={10}
                        required
                        autoComplete={
                          signup ? 'new-password' : 'current-password'
                        }
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </label>
                    <button className="primary" disabled={busy}>
                      {busy
                        ? 'Egy pillanat…'
                        : signup
                          ? 'Fiók létrehozása'
                          : 'Bejelentkezés'}{' '}
                      <ArrowRight size={16} />
                    </button>
                  </form>
                )}
                <button
                  className="text-button"
                  style={{ marginTop: 20 }}
                  onClick={() => setSignup((value) => !value)}
                >
                  {signup ? 'Már van fiókom' : 'Még nincs fiókom'}
                </button>
              </section>
            )}
            {(page === 'onboarding' || page === 'profile') && user && (
              <>
                <div className="page-head">
                  <div>
                    <div className="eyebrow">
                      Először ismerjük meg a jelened
                    </div>
                    <h1>A történeted alapjai.</h1>
                    <p>
                      A kitöltés szakaszonként menthető. Csak annyit kérünk,
                      amiből személyes történet készülhet.
                    </p>
                  </div>
                  <span className="badge">
                    {completedQuestions} / {questionnaire.questions.length}{' '}
                    válasz
                  </span>
                </div>
                <div className="progress">
                  <div
                    style={{
                      width: `${(completedQuestions / questionnaire.questions.length) * 100}%`,
                    }}
                  />
                </div>
                <div className="step-layout">
                  <aside className="steps" aria-label="Profil szakaszai">
                    {sections.map((section, index) => (
                      <button
                        key={section}
                        className={step === index ? 'active' : ''}
                        onClick={() => setStep(index)}
                      >
                        <span className="step-number">{index + 1}</span>
                        {section}
                      </button>
                    ))}
                  </aside>
                  <section className="panel">
                    {step === 0 && (
                      <>
                        <div className="notice">
                          A szolgáltatás 18 év feletti felhasználóknak készül. A
                          történetek AI által készített lehetséges
                          forgatókönyvek. A generáláshoz a szükséges
                          profiladatokat az OpenAI dolgozza fel.
                        </div>
                        <label className="checkbox">
                          <input
                            type="checkbox"
                            checked={adult}
                            onChange={(e) => setAdult(e.target.checked)}
                          />
                          <span>Elmúltam 18 éves.</span>
                        </label>
                        <label className="checkbox">
                          <input
                            type="checkbox"
                            checked={acknowledged}
                            onChange={(e) => setAcknowledged(e.target.checked)}
                          />
                          <span>
                            Elolvastam az{' '}
                            <button
                              className="text-button"
                              onClick={() =>
                                window.open(
                                  '/privacy',
                                  '_blank',
                                  'noopener,noreferrer',
                                )
                              }
                            >
                              adatkezelési tájékoztatót
                            </button>
                            , és értem az AI-generálás működését.
                          </span>
                        </label>
                      </>
                    )}
                    <div className="form-grid">
                      {step < 4 &&
                        (questionnaire.questions as Question[])
                          .filter(
                            (question) => question.section === sections[step],
                          )
                          .map(questionField)}
                    </div>
                    {step === 3 && answers.noCloseRelationships !== true && (
                      <>
                        <h3 style={{ marginTop: 20, fontSize: 17 }}>
                          Fontos kapcsolataid
                        </h3>
                        <p className="subtle">
                          Használj címkéket: Párom, Barát A, Kolléga A. Valódi
                          nevet nem kérünk.
                        </p>
                        {relationships.map((relationship, index) => (
                          <div className="relation-row" key={relationship.id}>
                            <input
                              aria-label={`${index + 1}. kapcsolat címkéje`}
                              maxLength={50}
                              value={relationship.label}
                              onChange={(e) =>
                                setRelationships((current) =>
                                  current.map((r, i) =>
                                    i === index
                                      ? { ...r, label: e.target.value }
                                      : r,
                                  ),
                                )
                              }
                            />
                            <select
                              aria-label={`${index + 1}. kapcsolat típusa`}
                              value={relationship.type}
                              onChange={(e) =>
                                setRelationships((current) =>
                                  current.map((r, i) =>
                                    i === index
                                      ? {
                                          ...r,
                                          type: e.target
                                            .value as Profile['relationships'][number]['type'],
                                        }
                                      : r,
                                  ),
                                )
                              }
                            >
                              <option value="friend">Barát</option>
                              <option value="partner">Partner</option>
                              <option value="family">Családtag</option>
                              <option value="colleague">Kolléga</option>
                              <option value="other">Egyéb</option>
                            </select>
                            <button
                              className="text-button"
                              onClick={() =>
                                setRelationships((current) =>
                                  current.filter((_, i) => i !== index),
                                )
                              }
                            >
                              Törlés
                            </button>
                          </div>
                        ))}
                        <button
                          className="secondary"
                          disabled={relationships.length >= 12}
                          onClick={() =>
                            setRelationships((current) => [
                              ...current,
                              {
                                id: crypto.randomUUID(),
                                label: `Barát ${current.length + 1}`,
                                type: 'friend',
                                closeness: 50,
                                support: 50,
                                conflict: 0,
                              },
                            ])
                          }
                        >
                          <Plus size={14} /> Kapcsolat hozzáadása
                        </button>
                      </>
                    )}
                    {step === 4 && (
                      <>
                        <div className="eyebrow">Mielőtt elindulnánk</div>
                        <h2 style={{ margin: '15px 0 25px' }}>
                          Ez adja az életágad kiindulópontját.
                        </h2>
                        <div className="form-grid">
                          {(questionnaire.questions as Question[])
                            .filter(
                              (q) => q.type !== 'scale' && q.type !== 'boolean',
                            )
                            .map((q) => (
                              <div className="field" key={q.key}>
                                <span>{q.label}</span>
                                <p className="subtle">
                                  {Array.isArray(answers[q.key])
                                    ? (answers[q.key] as string[])
                                        .map(
                                          (value) =>
                                            q.options?.find(
                                              (option) =>
                                                option.value === value,
                                            )?.label ?? value,
                                        )
                                        .join(' → ')
                                    : (q.options?.find(
                                        (option) =>
                                          option.value === answers[q.key],
                                      )?.label ??
                                      String(
                                        answers[q.key] ?? 'Még nincs válasz',
                                      ))}
                                </p>
                              </div>
                            ))}
                        </div>
                        <p className="subtle">
                          Habitus:{' '}
                          {
                            questionnaire.questions.filter(
                              (q) =>
                                q.section === 'Habitus' &&
                                answers[q.key] !== undefined,
                            ).length
                          }{' '}
                          / 12 válasz · {relationships.length} megadott
                          kapcsolat
                          {version
                            ? ` · korábbi profilverzió: ${version.version_no}`
                            : ''}
                        </p>
                        <div className="notice" style={{ marginTop: 25 }}>
                          Az első generálás néhány percet igénybe vehet. Az
                          elkészült szcenárió 10 évet fog át, a közelebbi
                          időszakot részletesebben.
                        </div>
                      </>
                    )}
                    <div className="actions">
                      {step > 0 && (
                        <button
                          className="secondary"
                          onClick={() => setStep((value) => value - 1)}
                        >
                          Vissza
                        </button>
                      )}
                      <button
                        className="text-button"
                        disabled={busy || !adult || !acknowledged}
                        onClick={() => {
                          void action(async () => {
                            await save();
                            setNotice('A profilpiszkozatot elmentettük.');
                          });
                        }}
                      >
                        Mentés
                      </button>
                      {step < 4 ? (
                        <button
                          className="primary"
                          disabled={busy || !adult || !acknowledged}
                          onClick={() => {
                            void nextStep();
                          }}
                        >
                          Mentés és tovább <ArrowRight size={15} />
                        </button>
                      ) : (
                        <button
                          className="primary"
                          disabled={busy || !adult || !acknowledged}
                          onClick={() => {
                            void createFuture();
                          }}
                        >
                          Elindítom az életágamat <Sparkles size={15} />
                        </button>
                      )}
                    </div>
                  </section>
                </div>
              </>
            )}
            {page === 'futures' && user && (
              <>
                <div className="page-head">
                  <div>
                    <div className="eyebrow">A te lehetséges történeteid</div>
                    <h1>Életágaim.</h1>
                    <p>Minden életág egy új nézőpont a jelenedre.</p>
                  </div>
                  <button
                    className="primary"
                    onClick={() => navigate('/onboarding')}
                  >
                    <Plus size={16} /> Új életág
                  </button>
                </div>
                {futures.length ? (
                  <div className="card-grid">
                    {futures.map((item) => (
                      <button
                        key={item.id}
                        className="future-card"
                        onClick={() =>
                          navigate(
                            item.status !== 'completed' && item.job_id
                              ? `/job/${item.job_id}`
                              : `/branch/${item.root_branch_id}`,
                          )
                        }
                      >
                        <GitBranch color="#2d6347" size={22} />
                        <span className="badge">
                          {item.status === 'completed'
                            ? 'ELKÉSZÜLT'
                            : item.status === 'failed'
                              ? 'MEGSZAKADT'
                              : 'KÉSZÜL'}
                        </span>
                        <h2>{item.title}</h2>
                        <p>
                          {new Date(item.created_at).toLocaleDateString(
                            'hu-HU',
                          )}{' '}
                          · 10 éves szcenárió
                        </p>
                        <ArrowUpRight size={16} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="empty">
                    <BookOpen size={30} />
                    <h2 style={{ marginTop: 20 }}>
                      Itt kapnak helyet a történeteid.
                    </h2>
                    <p>Az első életágadhoz töltsd ki a profilodat.</p>
                    <button
                      className="primary"
                      style={{ marginTop: 25 }}
                      onClick={() => navigate('/onboarding')}
                    >
                      Elkezdem <ArrowRight size={15} />
                    </button>
                  </div>
                )}
              </>
            )}
            {page === 'job' && user && (
              <div className="generation">
                <div className="eyebrow" style={{ justifyContent: 'center' }}>
                  A profilodból életág születik
                </div>
                {job?.status === 'failed' ? (
                  <>
                    <h1>A generálás megszakadt.</h1>
                    <p>{job.error_message_safe}</p>
                    <button
                      className="primary"
                      style={{ marginTop: 25 }}
                      onClick={() => navigate('/onboarding')}
                    >
                      Vissza a profilhoz
                    </button>
                  </>
                ) : (
                  <>
                    <div className="spinner" />
                    <h1>Formát kap egy lehetőség.</h1>
                    <p>
                      Az AI először felépíti az eseményeket, majd történetté
                      alakítja és ellenőrzi őket. Ez néhány percig is eltarthat.
                    </p>
                    <div className="stage-list">
                      {[
                        ['QUEUED', 'Várakozás a generálásra'],
                        [
                          'SIMULATING_EVENTS',
                          'Személyes események kialakítása',
                        ],
                        ['WRITING_CHAPTERS', 'Történetfejezetek megírása'],
                        ['CHECKING_STORY', 'A történet ellenőrzése'],
                        ['PERSISTING', 'Az életág mentése'],
                      ].map(([key, label]) => (
                        <div
                          key={key}
                          className={job?.stage === key ? 'done' : ''}
                        >
                          {job?.stage === key ? '●' : '○'} {label}
                        </div>
                      ))}
                    </div>
                    <p className="subtle">
                      Ezt az oldalt frissítheted vagy később újra megnyithatod.
                      A generálás a háttérben folytatódik.
                    </p>
                  </>
                )}
              </div>
            )}
            {page === 'branch' &&
              user &&
              (branch ? (
                <>
                  <div className="page-head">
                    <div>
                      <div className="eyebrow">
                        Lehetséges forgatókönyv · AI-tartalom
                      </div>
                      <h1>{branch.name}</h1>
                      <p>
                        Ez az életág a profilod egy rögzített változatából
                        indul.
                      </p>
                    </div>
                    <button
                      className="secondary"
                      onClick={() => navigate('/futures')}
                    >
                      Életágaim <GitBranch size={14} />
                    </button>
                  </div>
                  {future && (
                    <div className="tabs" aria-label="Életág választása">
                      {future.branches.map((item) => (
                        <button
                          key={item.id}
                          className={item.id === branch.id ? 'active' : ''}
                          onClick={() =>
                            navigate(
                              item.status !== 'completed' && item.job_id
                                ? `/job/${item.job_id}`
                                : `/branch/${item.id}`,
                            )
                          }
                        >
                          {item.name}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="tabs" aria-label="Életág nézete">
                    <button
                      className={tab === 'story' ? 'active' : ''}
                      onClick={() => setTab('story')}
                    >
                      Történet
                    </button>
                    <button
                      className={tab === 'timeline' ? 'active' : ''}
                      onClick={() => setTab('timeline')}
                    >
                      Idővonal
                    </button>
                    <button
                      className={tab === 'compare' ? 'active' : ''}
                      onClick={() => setTab('compare')}
                    >
                      Összehasonlítás
                    </button>
                  </div>
                  {branch.status !== 'completed' ? (
                    <div className="notice">
                      {branch.status === 'failed'
                        ? 'Az életág generálása megszakadt.'
                        : 'Ez az életág még készül. A státuszoldalon követheted a generálást.'}
                      {branch.job_id && (
                        <button
                          className="text-button"
                          onClick={() => navigate(`/job/${branch.job_id}`)}
                        >
                          Generálás állapota <ArrowRight size={14} />
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      {tab === 'story' && (
                        <div className="story">
                          {branch.chapters.map(
                            ({ id: chapterId, payload: chapter }) => (
                              <article
                                className="chapter panel"
                                key={chapterId}
                              >
                                <div className="eyebrow">
                                  {chapter.chapterNo}. fejezet
                                </div>
                                <h2>{chapter.title}</h2>
                                <p className="lead">{chapter.lead}</p>
                                <div className="prose">{chapter.body}</div>
                                {chapter.decisionEventKey &&
                                  branch.decisions
                                    .filter(
                                      (decision) =>
                                        branch.events.find(
                                          (event) =>
                                            event.id === decision.event_id,
                                        )?.canon.key ===
                                        chapter.decisionEventKey,
                                    )
                                    .map(decisionPanel)}
                              </article>
                            ),
                          )}
                          {branch.decisions
                            .filter(
                              (decision) =>
                                !branch.chapters.some(
                                  (chapter) =>
                                    chapter.payload.decisionEventKey ===
                                    branch.events.find(
                                      (event) => event.id === decision.event_id,
                                    )?.canon.key,
                                ),
                            )
                            .map(decisionPanel)}
                        </div>
                      )}
                      {tab === 'timeline' && (
                        <div className="timeline">
                          {branch.events.map((event) => (
                            <article className="event panel" key={event.id}>
                              <span className="badge">
                                {new Date(
                                  event.effective_at,
                                ).toLocaleDateString('hu-HU', {
                                  year: 'numeric',
                                  month: 'long',
                                })}
                                {event.inherited ? ' · KÖZÖS ELŐZMÉNY' : ''}
                              </span>
                              <h3>{event.canon.title}</h3>
                              <p>{event.canon.summary}</p>
                              <details>
                                <summary>
                                  Miért került ebbe az életágba?
                                </summary>
                                {event.canon.causes.map((cause, index) => (
                                  <p key={index}>{cause.explanation}</p>
                                ))}
                                <p>
                                  A szcenárió belső indoklása. Nem valós oksági
                                  bizonyíték.
                                </p>
                              </details>
                              {branch.decisions
                                .filter(
                                  (decision) => decision.event_id === event.id,
                                )
                                .map(decisionPanel)}
                            </article>
                          ))}
                        </div>
                      )}
                      {tab === 'compare' && (
                        <>
                          <label className="field">
                            <span>Melyik életággal veted össze?</span>
                            <select
                              value={compareBranch?.id ?? ''}
                              onChange={(e) => {
                                const selected = e.target.value;
                                if (selected)
                                  void action(async () =>
                                    setCompareBranch(
                                      await api<Branch>(
                                        `/branches/${selected}`,
                                      ),
                                    ),
                                  );
                                else setCompareBranch(null);
                              }}
                            >
                              <option value="">
                                Válassz egy másik elkészült ágat…
                              </option>
                              {future?.branches
                                .filter(
                                  (item) =>
                                    item.id !== branch.id &&
                                    item.status === 'completed',
                                )
                                .map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.name}
                                  </option>
                                ))}
                            </select>
                          </label>
                          {compareBranch ? (
                            <div className="compare">
                              {[branch, compareBranch].map((item) => (
                                <section className="panel" key={item.id}>
                                  <h3>{item.name}</h3>
                                  {item.events
                                    .filter((event) => !event.inherited)
                                    .map((event) => (
                                      <div className="metric" key={event.id}>
                                        <span>{event.canon.title}</span>
                                        <span>
                                          {event.effective_at.slice(0, 4)}
                                        </span>
                                      </div>
                                    ))}
                                </section>
                              ))}
                            </div>
                          ) : (
                            <p className="subtle">
                              Egy döntésből több ágat is nyithatsz, és itt
                              összevetheted az eltérő eseményeiket.
                            </p>
                          )}
                        </>
                      )}
                    </>
                  )}
                  <p className="subtle" style={{ marginTop: 30 }}>
                    Ez egy AI által készített lehetséges forgatókönyv, nem
                    előrejelzés és nem szakmai tanács.
                  </p>
                </>
              ) : (
                <div className="empty">Az életág betöltése…</div>
              ))}
            {(page === 'privacy' || page === 'settings') && (
              <section
                className="panel privacy-copy"
                style={{ maxWidth: 800, margin: 'auto' }}
              >
                <div className="eyebrow">A történeted a tiéd</div>
                <h1 style={{ margin: '15px 0 25px' }}>
                  Adatvédelem és saját adataid
                </h1>
                <p>
                  A profil és az életágak privátak. A rendszer élethelyzetet,
                  önbevallott habitust, célokat és álneves kapcsolati címkéket
                  használ. Pontos címet, munkáltatót, diagnózist vagy mások
                  valódi nevét nem kérjük.
                </p>
                <h2>Hogyan készül az AI-történet?</h2>
                <p>
                  A generálás az OpenAI API-n keresztül történik. Az események
                  és a narratíva elkészítéséhez a szükséges profiladatokat,
                  kapcsolati címkéket és szcenárióállapotot továbbítjuk. A saját
                  rendszerben a teljes prompt nem kerül az alkalmazás naplójába.
                  A szolgáltatói adatkezelés részleteit az indulás előtti
                  végleges tájékoztatóban rögzítjük.
                </p>
                <h2>Mit jelentenek az életágak?</h2>
                <p>
                  Fiktív, lehetséges forgatókönyvek. A pontszámok a szcenárió
                  szerkesztését segítik; nem pszichológiai diagnózisok és nem
                  valós jövőbeli valószínűségek.
                </p>
                <h2>Adatletöltés és törlés</h2>
                <p>
                  Az adataid JSON formátumban letölthetők. A törlés eltávolítja
                  a fiókot, a profilt és a hozzá tartozó szcenáriókat a működő
                  adatbázisból. Mindkét művelethez friss bejelentkezés
                  szükséges.
                </p>
                <div className="notice">
                  Zárt teszteléshez készülő változat. A végleges adatkezelői
                  adatok, megőrzési idők, szolgáltatói feltételek és
                  kapcsolatfelvételi cím még rögzítésre várnak.
                </div>
                {user && (
                  <>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => {
                        void action(async () => {
                          const data = await api('/me/export');
                          const url = URL.createObjectURL(
                            new Blob([JSON.stringify(data, null, 2)], {
                              type: 'application/json',
                            }),
                          );
                          const anchor = document.createElement('a');
                          anchor.href = url;
                          anchor.download = 'alter-jovo-export.json';
                          anchor.click();
                          setTimeout(() => URL.revokeObjectURL(url), 1000);
                        });
                      }}
                    >
                      <Download size={15} /> Adataim letöltése
                    </button>
                    <h2>Fiók végleges törlése</h2>
                    <label className="field">
                      <span>A törléshez írd be: FIÓK TÖRLÉSE</span>
                      <input
                        value={confirmation}
                        onChange={(e) => setConfirmation(e.target.value)}
                      />
                    </label>
                    <button
                      className="primary danger"
                      disabled={busy || confirmation !== 'FIÓK TÖRLÉSE'}
                      onClick={() => {
                        void action(async () => {
                          await api('/me', {
                            method: 'DELETE',
                            body: JSON.stringify({ confirmation }),
                          });
                          await supabase().auth.signOut();
                          navigate('/');
                        });
                      }}
                    >
                      Fiókom és történeteim törlése
                    </button>
                  </>
                )}
              </section>
            )}
          </>
        )}
      </main>
      <footer>
        <span>© {new Date().getFullYear()} Alter Jövő</span>
        <span>Egy lehetséges történet. A valódi döntés a tiéd.</span>
      </footer>
    </>
  );
}
