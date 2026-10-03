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
  getQuestionnaire,
  languages,
  errorMessage,
  type Locale,
  type Question,
  type Profile,
  type CandidateEvent,
  type ChapterOutput,
  type LifeState,
} from '@future-flow/contracts';
import {
  api,
  authConfigured,
  supabase,
  clientErrorMessage,
} from '../lib/client';
import { LanguageSelect, useLanguage } from './language-provider';
import { formatDate } from '../lib/i18n';

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
  content_locale: Locale;
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
  content_locale: Locale;
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
    parent_branch_id: string | null;
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
  error_code: string | null;
};
const message = clientErrorMessage;

export function Experience() {
  const { locale, t } = useLanguage();
  const questionnaire = getQuestionnaire(locale);
  const branchName = (item: {
    name: string;
    parent_branch_id: string | null;
  }) => (item.parent_branch_id === null ? t('story.baseline') : item.name);
  const sections = [
    t('profile.lifeSituation'),
    t('profile.workSecurity'),
    t('profile.temperament'),
    t('profile.directionRelationships'),
    t('profile.summary'),
  ];
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
  useEffect(() => {
    setNotice('');
    setConfirmation('');
  }, [locale]);
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
          setNotice(t('auth.confirmationSent'));
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
        locale,
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
          locale,
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
            <option value="">{t('common.choose')}</option>
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
              question.key === 'goalTitle' ? t('profile.goalExample') : ''
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
              <span>{t('common.low')}</span>
              <span>
                {typeof value === 'number'
                  ? `${value} / 100`
                  : t('profile.unanswered')}
              </span>
              <span>{t('common.high')}</span>
            </div>
            {value === undefined && (
              <button
                type="button"
                className="text-button"
                onClick={() => update(50)}
              >
                {t('profile.chooseMiddle')}
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
            <span>{t('common.yes')}</span>
            <button
              type="button"
              className="text-button"
              onClick={() => update(false)}
            >
              {t('profile.hasRelationships')}
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
      <div className="eyebrow">{t('story.nextDecision')}</div>
      <h3 lang={branch?.content_locale}>{decision.prompt}</h3>
      {decision.options.map((option) => (
        <button
          className="option"
          key={option.id}
          disabled={busy}
          onClick={() => {
            void resolve(decision.id, option.id);
          }}
        >
          <span lang={branch?.content_locale}>{option.payload.label}</span>
          <small lang={branch?.content_locale}>
            {option.payload.description}
          </small>
        </button>
      ))}
      <p className="subtle" style={{ marginTop: 15 }}>
        {t('story.decisionHelp')}
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
          alterward
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
        <div className="header-actions">
          <LanguageSelect />
          <nav className="nav" aria-label={t('nav.main')}>
            <button
              className={page === 'futures' ? 'active' : ''}
              onClick={() => navigate(user ? '/futures' : '/login')}
            >
              {t('nav.lives')}
            </button>
            <button
              className={page === 'onboarding' ? 'active' : ''}
              onClick={() => navigate(user ? '/onboarding' : '/login')}
            >
              {t('nav.profile')}
            </button>
            <button onClick={() => navigate('/privacy')}>
              {t('nav.privacy')}
            </button>
            {user ? (
              <button
                className="login"
                onClick={() => {
                  void action(async () => {
                    await supabase().auth.signOut();
                    navigate('/');
                  });
                }}
                aria-label={t('auth.signOut')}
              >
                <LogOut size={15} />
              </button>
            ) : (
              <button className="login" onClick={() => navigate('/login')}>
                {t('auth.signInShort')}
                <ArrowUpRight size={12} />
              </button>
            )}
          </nav>
        </div>
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
            <h1>{t('auth.privateStory')}</h1>
            <p>{t('auth.signInToContinue')}</p>
            <button className="primary" onClick={() => navigate('/login')}>
              {t('auth.signIn')}
              <ArrowRight size={16} />
            </button>
          </div>
        ) : (
          <>
            {page === 'home' && (
              <>
                <section className="hero">
                  <div>
                    <div className="eyebrow">{t('home.eyebrow')}</div>
                    <h1>
                      {t('home.oneLife')}
                      <br />
                      {t('home.many')} <em>{t('home.possibilities')}</em>
                    </h1>
                    <p className="intro">{t('home.introduction')}</p>
                    <div className="hero-actions">
                      <button
                        className="primary"
                        onClick={() =>
                          navigate(user ? '/onboarding' : '/login')
                        }
                      >
                        {t('home.start')}
                        <ArrowUpRight size={17} />
                      </button>
                      <button
                        className="text-button"
                        onClick={() =>
                          document
                            .getElementById('how')
                            ?.scrollIntoView({ behavior: 'smooth' })
                        }
                      >
                        {t('home.howItWorks')}
                        <ArrowRight size={13} />
                      </button>
                    </div>
                    <div className="fineprint">
                      <Lock size={12} />
                      {t('home.notes')}
                    </div>
                  </div>
                  <div
                    className="orbit"
                    aria-label={t('home.illustrationLabel')}
                  >
                    <span className="illustration-label">
                      {t('home.illustrationHeading')}
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
                      <small>{t('home.cityBadge')}</small>
                      <h3>{t('home.cityTitle')}</h3>
                      <p>{t('home.cityDescription')}</p>
                    </div>
                    <div className="path-card two">
                      <small>{t('home.ideaBadge')}</small>
                      <h3>{t('home.ideaTitle')}</h3>
                      <p>{t('home.ideaDescription')}</p>
                    </div>
                    <div className="path-card three">
                      <small>{t('home.changeBadge')}</small>
                      <h3>{t('home.changeTitle')}</h3>
                      <p>{t('home.changeDescription')}</p>
                    </div>
                    <div className="root-node">
                      <Compass size={14} />
                      {t('home.present')}
                    </div>
                  </div>
                </section>
                <section className="principles" id="how">
                  <div className="principle">
                    <Compass size={22} />
                    <div>
                      <h3>{t('home.personalTitle')}</h3>
                      <p>{t('home.personalDescription')}</p>
                    </div>
                  </div>
                  <div className="principle">
                    <GitBranch size={22} />
                    <div>
                      <h3>{t('home.choiceTitle')}</h3>
                      <p>{t('home.choiceDescription')}</p>
                    </div>
                  </div>
                  <div className="principle">
                    <ShieldCheck size={22} />
                    <div>
                      <h3>{t('home.privateTitle')}</h3>
                      <p>{t('home.privateDescription')}</p>
                    </div>
                  </div>
                </section>
                <p className="subtle" style={{ marginTop: 30 }}>
                  {t('home.illustrationNote')}
                </p>
              </>
            )}
            {page === 'login' && (
              <section className="panel narrow">
                <div className="eyebrow">{t('auth.eyebrow')}</div>
                <h1>
                  {signup ? t('auth.signUpTitle') : t('auth.welcomeBack')}
                </h1>
                <p>
                  {signup
                    ? t('auth.signUpDescription')
                    : t('auth.signInDescription')}
                </p>
                {!authConfigured ? (
                  <div className="notice">{t('auth.notConfigured')}</div>
                ) : (
                  <form
                    onSubmit={(event) => {
                      void login(event);
                    }}
                  >
                    <label className="field">
                      <span>{t('auth.email')}</span>
                      <input
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span>{t('auth.password')}</span>
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
                        ? t('common.pleaseWait')
                        : signup
                          ? t('auth.createAccount')
                          : t('auth.signIn')}{' '}
                      <ArrowRight size={16} />
                    </button>
                  </form>
                )}
                <button
                  className="text-button"
                  style={{ marginTop: 20 }}
                  onClick={() => setSignup((value) => !value)}
                >
                  {signup ? t('auth.haveAccount') : t('auth.needAccount')}
                </button>
              </section>
            )}
            {(page === 'onboarding' || page === 'profile') && user && (
              <>
                <div className="page-head">
                  <div>
                    <div className="eyebrow">{t('profile.eyebrow')}</div>
                    <h1>{t('profile.title')}</h1>
                    <p>{t('profile.description')}</p>
                  </div>
                  <span className="badge">
                    {completedQuestions} / {questionnaire.questions.length}{' '}
                    {t('profile.answers')}
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
                  <aside className="steps" aria-label={t('profile.sections')}>
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
                          {t('profile.consentNotice')}
                        </div>
                        <label className="checkbox">
                          <input
                            type="checkbox"
                            checked={adult}
                            onChange={(e) => setAdult(e.target.checked)}
                          />
                          <span>{t('profile.adult')}</span>
                        </label>
                        <label className="checkbox">
                          <input
                            type="checkbox"
                            checked={acknowledged}
                            onChange={(e) => setAcknowledged(e.target.checked)}
                          />
                          <span>
                            {t('profile.readPrivacy')}{' '}
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
                              {t('profile.privacyLink')}
                            </button>
                            {t('profile.understandAI')}
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
                          {t('profile.relationshipsTitle')}
                        </h3>
                        <p className="subtle">
                          {t('profile.relationshipsHelp')}
                        </p>
                        {relationships.map((relationship, index) => (
                          <div className="relation-row" key={relationship.id}>
                            <input
                              aria-label={t('relationship.label', {
                                number: index + 1,
                              })}
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
                              aria-label={t('relationship.type', {
                                number: index + 1,
                              })}
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
                              <option value="friend">
                                {t('relationship.friend')}
                              </option>
                              <option value="partner">
                                {t('relationship.partner')}
                              </option>
                              <option value="family">
                                {t('relationship.family')}
                              </option>
                              <option value="colleague">
                                {t('relationship.colleague')}
                              </option>
                              <option value="other">
                                {t('relationship.other')}
                              </option>
                            </select>
                            <button
                              className="text-button"
                              onClick={() =>
                                setRelationships((current) =>
                                  current.filter((_, i) => i !== index),
                                )
                              }
                            >
                              {t('common.remove')}
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
                                label: t('relationship.defaultName', {
                                  number: current.length + 1,
                                }),
                                type: 'friend',
                                closeness: 50,
                                support: 50,
                                conflict: 0,
                              },
                            ])
                          }
                        >
                          <Plus size={14} />
                          {t('profile.addRelationship')}
                        </button>
                      </>
                    )}
                    {step === 4 && (
                      <>
                        <div className="eyebrow">
                          {t('profile.reviewEyebrow')}
                        </div>
                        <h2 style={{ margin: '15px 0 25px' }}>
                          {t('profile.reviewTitle')}
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
                                        answers[q.key] ??
                                          t('profile.unanswered'),
                                      ))}
                                </p>
                              </div>
                            ))}
                        </div>
                        <p className="subtle">
                          {t('profile.temperamentSummary')}{' '}
                          {
                            questionnaire.questions.filter(
                              (q) =>
                                q.section === t('profile.temperament') &&
                                answers[q.key] !== undefined,
                            ).length
                          }{' '}
                          {t('profile.traitAnswers')}
                          {relationships.length}
                          {t('profile.relationshipCount')}
                          {version
                            ? t('profile.previousVersion', {
                                version: version.version_no,
                              })
                            : ''}
                        </p>
                        <div className="notice" style={{ marginTop: 25 }}>
                          {t('profile.generationNotice')}
                        </div>
                      </>
                    )}
                    <div className="actions">
                      {step > 0 && (
                        <button
                          className="secondary"
                          onClick={() => setStep((value) => value - 1)}
                        >
                          {t('common.back')}
                        </button>
                      )}
                      <button
                        className="text-button"
                        disabled={busy || !adult || !acknowledged}
                        onClick={() => {
                          void action(async () => {
                            await save();
                            setNotice(t('profile.saved'));
                          });
                        }}
                      >
                        {t('common.save')}
                      </button>
                      {step < 4 ? (
                        <button
                          className="primary"
                          disabled={busy || !adult || !acknowledged}
                          onClick={() => {
                            void nextStep();
                          }}
                        >
                          {t('profile.saveContinue')}
                          <ArrowRight size={15} />
                        </button>
                      ) : (
                        <button
                          className="primary"
                          disabled={busy || !adult || !acknowledged}
                          onClick={() => {
                            void createFuture();
                          }}
                        >
                          {t('profile.generate')}
                          <Sparkles size={15} />
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
                    <div className="eyebrow">{t('lives.eyebrow')}</div>
                    <h1>{t('lives.title')}</h1>
                    <p>{t('lives.description')}</p>
                  </div>
                  <button
                    className="primary"
                    onClick={() => navigate('/onboarding')}
                  >
                    <Plus size={16} />
                    {t('lives.new')}
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
                            ? t('status.completed')
                            : item.status === 'failed'
                              ? t('status.failed')
                              : t('status.generating')}
                        </span>
                        <h2>{item.title}</h2>
                        <p>
                          {formatDate(item.created_at, locale)}{' '}
                          {t('lives.horizon')}
                        </p>
                        <ArrowUpRight size={16} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="empty">
                    <BookOpen size={30} />
                    <h2 style={{ marginTop: 20 }}>{t('lives.emptyTitle')}</h2>
                    <p>{t('lives.emptyDescription')}</p>
                    <button
                      className="primary"
                      style={{ marginTop: 25 }}
                      onClick={() => navigate('/onboarding')}
                    >
                      {t('lives.begin')}
                      <ArrowRight size={15} />
                    </button>
                  </div>
                )}
              </>
            )}
            {page === 'job' && user && (
              <div className="generation">
                <div className="eyebrow" style={{ justifyContent: 'center' }}>
                  {t('job.eyebrow')}
                </div>
                {job?.status === 'failed' ? (
                  <>
                    <h1>{t('job.failed')}</h1>
                    <p>
                      {errorMessage(locale, job.error_code ?? 'REQUEST_FAILED')}
                    </p>
                    <button
                      className="primary"
                      style={{ marginTop: 25 }}
                      onClick={() => navigate('/onboarding')}
                    >
                      {t('job.backToProfile')}
                    </button>
                  </>
                ) : (
                  <>
                    <div className="spinner" />
                    <h1>{t('job.title')}</h1>
                    <p>{t('job.description')}</p>
                    <div className="stage-list">
                      {[
                        ['QUEUED', t('job.queued')],
                        ['SIMULATING_EVENTS', t('job.events')],
                        ['WRITING_CHAPTERS', t('job.chapters')],
                        ['CHECKING_STORY', t('job.check')],
                        ['PERSISTING', t('job.save')],
                      ].map(([key, label]) => (
                        <div
                          key={key}
                          className={job?.stage === key ? 'done' : ''}
                        >
                          {job?.stage === key ? '●' : '○'} {label}
                        </div>
                      ))}
                    </div>
                    <p className="subtle">{t('job.resumeHelp')}</p>
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
                      <div className="eyebrow">{t('story.eyebrow')}</div>
                      <h1>{branchName(branch)}</h1>
                      <p>{t('story.profileVersion')}</p>
                      <p className="subtle">
                        {t('story.language')}:{' '}
                        {languages[branch.content_locale].nativeName}
                      </p>
                    </div>
                    <button
                      className="secondary"
                      onClick={() => navigate('/futures')}
                    >
                      {t('nav.lives')}
                      <GitBranch size={14} />
                    </button>
                  </div>
                  {branch.content_locale !== locale && (
                    <div className="notice">
                      {t('story.originalLanguage', {
                        language: languages[branch.content_locale].nativeName,
                      })}
                    </div>
                  )}
                  {future && (
                    <div className="tabs" aria-label={t('story.chooseBranch')}>
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
                          {branchName(item)}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="tabs" aria-label={t('story.views')}>
                    <button
                      className={tab === 'story' ? 'active' : ''}
                      onClick={() => setTab('story')}
                    >
                      {t('story.story')}
                    </button>
                    <button
                      className={tab === 'timeline' ? 'active' : ''}
                      onClick={() => setTab('timeline')}
                    >
                      {t('story.timeline')}
                    </button>
                    <button
                      className={tab === 'compare' ? 'active' : ''}
                      onClick={() => setTab('compare')}
                    >
                      {t('story.compare')}
                    </button>
                  </div>
                  {branch.status !== 'completed' ? (
                    <div className="notice">
                      {branch.status === 'failed'
                        ? t('story.failed')
                        : t('story.generatingHelp')}
                      {branch.job_id && (
                        <button
                          className="text-button"
                          onClick={() => navigate(`/job/${branch.job_id}`)}
                        >
                          {t('story.generationStatus')}
                          <ArrowRight size={14} />
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
                                  {t('story.chapter', {
                                    number: chapter.chapterNo,
                                  })}
                                </div>
                                <h2 lang={branch.content_locale}>
                                  {chapter.title}
                                </h2>
                                <p
                                  className="lead"
                                  lang={branch.content_locale}
                                >
                                  {chapter.lead}
                                </p>
                                <div
                                  className="prose"
                                  lang={branch.content_locale}
                                >
                                  {chapter.body}
                                </div>
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
                                {formatDate(event.effective_at, locale)}
                                {event.inherited
                                  ? t('story.sharedHistory')
                                  : ''}
                              </span>
                              <h3 lang={branch.content_locale}>
                                {event.canon.title}
                              </h3>
                              <p lang={branch.content_locale}>
                                {event.canon.summary}
                              </p>
                              <details>
                                <summary>{t('story.why')}</summary>
                                {event.canon.causes.map((cause, index) => (
                                  <p key={index} lang={branch.content_locale}>
                                    {cause.explanation}
                                  </p>
                                ))}
                                <p>{t('story.causeNote')}</p>
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
                            <span>{t('story.compareLabel')}</span>
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
                                {t('story.comparePlaceholder')}
                              </option>
                              {future?.branches
                                .filter(
                                  (item) =>
                                    item.id !== branch.id &&
                                    item.status === 'completed',
                                )
                                .map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {branchName(item)}
                                  </option>
                                ))}
                            </select>
                          </label>
                          {compareBranch ? (
                            <div className="compare">
                              {[branch, compareBranch].map((item) => (
                                <section className="panel" key={item.id}>
                                  <h3>{branchName(item)}</h3>
                                  {item.events
                                    .filter((event) => !event.inherited)
                                    .map((event) => (
                                      <div className="metric" key={event.id}>
                                        <span lang={item.content_locale}>
                                          {event.canon.title}
                                        </span>
                                        <span>
                                          {event.effective_at.slice(0, 4)}
                                        </span>
                                      </div>
                                    ))}
                                </section>
                              ))}
                            </div>
                          ) : (
                            <p className="subtle">{t('story.compareHelp')}</p>
                          )}
                        </>
                      )}
                    </>
                  )}
                  <p className="subtle" style={{ marginTop: 30 }}>
                    {t('story.disclaimer')}
                  </p>
                </>
              ) : (
                <div className="empty">{t('story.loading')}</div>
              ))}
            {(page === 'privacy' || page === 'settings') && (
              <section
                className="panel privacy-copy"
                style={{ maxWidth: 800, margin: 'auto' }}
              >
                <div className="eyebrow">{t('home.privateTitle')}</div>
                <h1 style={{ margin: '15px 0 25px' }}>{t('privacy.title')}</h1>
                <p>{t('privacy.introduction')}</p>
                <h2>{t('privacy.aiTitle')}</h2>
                <p>{t('privacy.aiDescription')}</p>
                <h2>{t('privacy.scenarioTitle')}</h2>
                <p>{t('privacy.scenarioDescription')}</p>
                <h2>{t('privacy.dataTitle')}</h2>
                <p>{t('privacy.dataDescription')}</p>
                <div className="notice">{t('privacy.alphaNotice')}</div>
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
                          anchor.download = 'alterward-export.json';
                          anchor.click();
                          setTimeout(() => URL.revokeObjectURL(url), 1000);
                        });
                      }}
                    >
                      <Download size={15} />
                      {t('privacy.download')}
                    </button>
                    <h2>{t('privacy.deleteTitle')}</h2>
                    <label className="field">
                      <span>{t('privacy.deletePrompt')}</span>
                      <input
                        value={confirmation}
                        onChange={(e) => setConfirmation(e.target.value)}
                      />
                    </label>
                    <button
                      className="primary danger"
                      disabled={
                        busy || confirmation !== t('privacy.deleteConfirmation')
                      }
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
                      {t('privacy.delete')}
                    </button>
                  </>
                )}
              </section>
            )}
          </>
        )}
      </main>
      <footer>
        <span>© {new Date().getFullYear()} alterward</span>
        <span>{t('footer.note')}</span>
      </footer>
    </>
  );
}
