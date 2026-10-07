import { randomInt, randomUUID } from 'node:crypto';
import { deletedLifeAdmissionSql } from './life-deletion';
import {
  profileSchema,
  questionnaire,
  CONTRACT_VERSION,
  LIFE_CONTRACT_VERSION,
  PUBLIC_DRAFT_VERSION,
  SIMULATION_VERSION,
  type Profile,
  type LifeState,
  type WorldState,
  type ChapterOutput,
  localeSchema,
  languages,
  supportedLocales,
  type Locale,
} from '@future-flow/contracts';
import {
  DomainError,
  buildProfile,
  worldState,
  initialState,
  addMonths,
  applyEffects,
  hash,
  type CanonEvent,
} from '@future-flow/core';
import type { Database } from './index';
import {
  cancelSharedAccountJobs,
  exportSharedAccount,
} from './shared-contexts';
import { exportSharedSafety } from './shared-safety';

type Row = Record<string, unknown>;
type ProfileRow = Row & {
  id: string;
  version_no: number;
  snapshot: Profile;
  draft_revision: number;
};
export type JobInput = {
  locale?: Locale;
  profile: Profile;
  state: LifeState;
  world: WorldState;
  horizonMonths: number;
  seed: number;
  decision: { label: string; constraints: unknown[] } | null;
};
export type Job = Row & {
  id: string;
  user_id: string;
  branch_id: string;
  job_type: 'future' | 'branch';
  payload: JobInput;
  checkpoints: Record<string, unknown>;
  lease_token: string;
  attempt: number;
  status: string;
};
export type Draft = Row & {
  revision: number;
  answers: Record<string, unknown>;
  relationships: Profile['relationships'];
};
const json = (value: unknown) => JSON.stringify(value);
const requireRow = <T>(
  rows: T[],
  message = 'A kért adat nem található.',
): T => {
  const row = rows[0];
  if (!row) throw new DomainError('RESOURCE_NOT_FOUND', message, 404);
  return row;
};
export class Repository {
  constructor(
    public readonly db: Database,
    private readonly limits = { daily: 10, concurrent: 2 },
  ) {}
  async ensureUser(userId: string) {
    await this.db.query(
      'INSERT INTO ff_users(id) VALUES($1) ON CONFLICT DO NOTHING',
      [userId],
    );
    const user = requireRow(
      await this.db.query('SELECT status FROM ff_users WHERE id=$1', [userId]),
    );
    if (user.status !== 'active')
      throw new DomainError(
        'ACCOUNT_DELETING',
        'A fiók törlése folyamatban van.',
        403,
      );
  }
  private async lockUser(tx: Database, userId: string) {
    const user = requireRow(
      await tx.query('SELECT status FROM ff_users WHERE id=$1 FOR UPDATE', [
        userId,
      ]),
    );
    if (user.status !== 'active')
      throw new DomainError(
        'ACCOUNT_DELETING',
        'A fiók törlése folyamatban van.',
        403,
      );
  }
  async acceptPrivacy(userId: string) {
    await this.db.query(
      "INSERT INTO ff_consents(id,user_id,policy_version,consent_type) VALUES($1,$2,'alpha-privacy-v1','adult_and_ai_acknowledgement') ON CONFLICT DO NOTHING",
      [randomUUID(), userId],
    );
  }
  async privacyStatus(userId: string) {
    const row = requireRow(
      await this.db.query<{ acknowledged: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM ff_consents c WHERE c.user_id=u.id AND c.policy_version='alpha-privacy-v1' AND c.consent_type='adult_and_ai_acknowledgement') AS acknowledged FROM ff_users u WHERE u.id=$1 AND u.status='active'",
        [userId],
      ),
    );
    return {
      schemaVersion: 'privacy-consent-status-1' as const,
      acknowledged: row.acknowledged,
      policyVersion: 'alpha-privacy-v1' as const,
    };
  }
  private async requirePrivacy(tx: Database, userId: string) {
    const consent = await tx.query(
      "SELECT id FROM ff_consents WHERE user_id=$1 AND policy_version='alpha-privacy-v1' AND consent_type='adult_and_ai_acknowledgement'",
      [userId],
    );
    if (!consent.length)
      throw new DomainError(
        'PRIVACY_ACKNOWLEDGEMENT_REQUIRED',
        'A felnőttkor és az AI-adatkezelési tájékoztató elfogadása szükséges.',
        403,
      );
  }
  async getDraft(userId: string): Promise<Draft> {
    const rows = await this.db.query<Draft>(
      'SELECT revision,answers,relationships FROM ff_profile_drafts WHERE user_id=$1',
      [userId],
    );
    return rows[0] ?? { revision: 0, answers: {}, relationships: [] };
  }
  async saveDraft(
    userId: string,
    revision: number,
    answers: Record<string, unknown>,
    relationships: Profile['relationships'],
  ) {
    for (const key of Object.keys(answers))
      if (!questionnaire.questions.some((q) => q.key === key))
        throw new DomainError('PROFILE_UNKNOWN_QUESTION', 'Ismeretlen kérdés.');
    return this.db.transaction(async (tx) => {
      await this.lockUser(tx, userId);
      await this.requirePrivacy(tx, userId);
      const previous = (
        await tx.query<Draft>(
          'SELECT revision,answers,relationships FROM ff_profile_drafts WHERE user_id=$1',
          [userId],
        )
      )[0];
      if ((previous?.revision ?? 0) !== revision)
        throw new DomainError(
          'PROFILE_REVISION_CONFLICT',
          'A profil egy másik ablakban megváltozott. Töltsd újra az aktuális változatot.',
          409,
        );
      await tx.query(
        `INSERT INTO ff_profile_drafts(user_id,revision,questionnaire_version,answers,relationships) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(user_id) DO UPDATE SET revision=EXCLUDED.revision,answers=EXCLUDED.answers,relationships=EXCLUDED.relationships,updated_at=now()`,
        [
          userId,
          revision + 1,
          questionnaire.version,
          json(answers),
          json(relationships),
        ],
      );
      return { revision: revision + 1 };
    });
  }
  async commitProfile(userId: string, revision: number) {
    return this.db.transaction(async (tx) => {
      await this.lockUser(tx, userId);
      await this.requirePrivacy(tx, userId);
      const draft = requireRow(
        await tx.query<Draft>(
          'SELECT revision,answers,relationships FROM ff_profile_drafts WHERE user_id=$1',
          [userId],
        ),
      );
      if (draft.revision !== revision)
        throw new DomainError(
          'PROFILE_REVISION_CONFLICT',
          'A profil megváltozott az összegzés óta.',
          409,
        );
      const existing = (
        await tx.query<ProfileRow>(
          'SELECT id,version_no,snapshot FROM ff_profile_versions WHERE user_id=$1 AND draft_revision=$2',
          [userId, revision],
        )
      )[0];
      if (existing)
        return {
          profileVersionId: existing.id,
          version: existing.version_no,
          profile: existing.snapshot,
        };
      const profile = buildProfile(draft.answers, draft.relationships);
      const count = requireRow(
        await tx.query(
          'SELECT COALESCE(MAX(version_no),0)::int AS version FROM ff_profile_versions WHERE user_id=$1',
          [userId],
        ),
      );
      const id = randomUUID();
      const version = Number(count.version) + 1;
      await tx.query(
        `INSERT INTO ff_profile_versions(id,user_id,version_no,draft_revision,schema_version,questionnaire_version,scoring_version,snapshot,answers,snapshot_hash)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          id,
          userId,
          version,
          revision,
          CONTRACT_VERSION,
          questionnaire.version,
          questionnaire.scoringVersion,
          json(profile),
          json(draft.answers),
          hash(profile),
        ],
      );
      return { profileVersionId: id, version, profile };
    });
  }
  async currentProfile(userId: string) {
    const versions = await this.db.query<ProfileRow>(
      'SELECT id,version_no,snapshot FROM ff_profile_versions WHERE user_id=$1 ORDER BY version_no DESC LIMIT 1',
      [userId],
    );
    const consents = await this.db.query(
      "SELECT id FROM ff_consents WHERE user_id=$1 AND policy_version='alpha-privacy-v1' AND consent_type='adult_and_ai_acknowledgement'",
      [userId],
    );
    return {
      current: versions[0] ?? null,
      draft: await this.getDraft(userId),
      acknowledged: consents.length > 0,
    };
  }
  private async createOnce<T>(
    userId: string,
    scope: string,
    key: string,
    input: unknown,
    run: (tx: Database) => Promise<T>,
  ): Promise<T> {
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(key))
      throw new DomainError(
        'IDEMPOTENCY_KEY_REQUIRED',
        'Egy 8–100 karakteres Idempotency-Key fejléc szükséges.',
        400,
      );
    return this.db.transaction(async (tx) => {
      await this.lockUser(tx, userId);
      await this.requirePrivacy(tx, userId);
      const previous = (
        await tx.query(
          'SELECT input_hash,response FROM ff_idempotency WHERE user_id=$1 AND scope=$2 AND key=$3',
          [userId, scope, key],
        )
      )[0];
      if (previous) {
        if (previous.input_hash !== hash(input))
          throw new DomainError(
            'IDEMPOTENCY_CONFLICT',
            'Ez a kérésazonosító már más adatokhoz tartozik.',
            409,
          );
        return previous.response as T;
      }
      const counts = requireRow(
        await tx.query(
          `SELECT count(*) FILTER(WHERE created_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')::int AS daily,
        count(*) FILTER(WHERE status IN ('queued','running','validating'))::int AS concurrent FROM (SELECT status,created_at FROM ff_jobs WHERE user_id=$1 UNION ALL SELECT status,created_at FROM aw_jobs WHERE user_id=$1 ${await deletedLifeAdmissionSql(tx, 'generation')}) q`,
          [userId],
        ),
      );
      if (
        Number(counts.daily) >= this.limits.daily ||
        Number(counts.concurrent) >= this.limits.concurrent
      )
        throw new DomainError(
          'GENERATION_LIMIT',
          'Elérted a generálási korlátot. Próbáld meg később.',
          429,
        );
      const response = await run(tx);
      await tx.query(
        'INSERT INTO ff_idempotency(user_id,scope,key,input_hash,response) VALUES($1,$2,$3,$4,$5)',
        [userId, scope, key, hash(input), json(response)],
      );
      return response;
    });
  }
  async createFuture(
    userId: string,
    profileVersionId: string,
    key: string,
    locale: Locale = 'en',
  ) {
    localeSchema.parse(locale);
    return this.createOnce(
      userId,
      'future',
      key,
      { profileVersionId, locale },
      async (tx) => {
        const version = requireRow(
          await tx.query<ProfileRow>(
            'SELECT id,snapshot FROM ff_profile_versions WHERE id=$1 AND user_id=$2',
            [profileVersionId, userId],
          ),
        );
        const profile = profileSchema.parse(version.snapshot);
        const world = worldState(profile);
        const futureId = randomUUID(),
          branchId = randomUUID(),
          worldId = randomUUID(),
          jobId = randomUUID();
        const start = new Date().toISOString().slice(0, 10);
        const seed = randomInt(1, 2147483647);
        await tx.query(
          'INSERT INTO ff_world_versions(id,user_id,version,snapshot,snapshot_hash) VALUES($1,$2,$3,$4,$5)',
          [worldId, userId, world.version, json(world), hash(world)],
        );
        await tx.query(
          'INSERT INTO ff_futures(id,user_id,profile_version_id,world_version_id,horizon_start,horizon_end,simulation_version,root_branch_id,content_locale,title) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
          [
            futureId,
            userId,
            profileVersionId,
            worldId,
            start,
            addMonths(start, 120),
            SIMULATION_VERSION,
            branchId,
            locale,
            languages[locale].newLifeTitle,
          ],
        );
        await tx.query(
          'INSERT INTO ff_branches(id,user_id,future_id,name,seed) VALUES($1,$2,$3,$4,$5)',
          [branchId, userId, futureId, languages[locale].baselineTitle, seed],
        );
        const payload: JobInput = {
          locale,
          profile,
          world,
          state: initialState(profile, start),
          horizonMonths: 120,
          seed,
          decision: null,
        };
        await tx.query(
          "INSERT INTO ff_jobs(id,user_id,branch_id,job_type,payload) VALUES($1,$2,$3,'future',$4)",
          [jobId, userId, branchId, json(payload)],
        );
        return { futureId, branchId, jobId, status: 'queued' };
      },
    );
  }
  async resolveDecision(
    userId: string,
    decisionId: string,
    optionId: string,
    key: string,
  ) {
    return this.createOnce(
      userId,
      `decision:${decisionId}`,
      key,
      { optionId },
      async (tx) => {
        const option = requireRow(
          await tx.query<
            Row & {
              parent_branch_id: string;
              event_id: string;
              payload: {
                label: string;
                effects: CanonEvent['effects'];
                constraints: unknown[];
              };
              canon: CanonEvent;
              future_id: string;
              snapshot: Profile;
              world: WorldState;
              horizon_end: string;
              content_locale: Locale;
            }
          >(
            `SELECT d.branch_id AS parent_branch_id,d.event_id,o.payload,e.canon,b.future_id,p.snapshot,w.snapshot AS world,f.horizon_end::text,f.content_locale
        FROM ff_decision_options o JOIN ff_decisions d ON d.id=o.decision_id JOIN ff_events e ON e.id=d.event_id
        JOIN ff_branches b ON b.id=d.branch_id JOIN ff_futures f ON f.id=b.future_id
        JOIN ff_profile_versions p ON p.id=f.profile_version_id JOIN ff_world_versions w ON w.id=f.world_version_id
        WHERE o.id=$1 AND d.id=$2 AND d.user_id=$3 AND b.status='completed'`,
            [optionId, decisionId, userId],
          ),
        );
        const state = applyEffects(
          option.canon.stateAfter,
          option.payload.effects,
          option.canon.effectiveAt,
        );
        const a = new Date(state.effectiveAt),
          b = new Date(option.horizon_end);
        const horizonMonths =
          (b.getUTCFullYear() - a.getUTCFullYear()) * 12 +
          b.getUTCMonth() -
          a.getUTCMonth();
        if (horizonMonths < 6)
          throw new DomainError(
            'BRANCH_HORIZON_TOO_SHORT',
            'Ezen a ponton túl kevés idő maradt új ág generálására.',
          );
        const branchId = randomUUID(),
          jobId = randomUUID(),
          seed = randomInt(1, 2147483647);
        await tx.query(
          'INSERT INTO ff_branches(id,user_id,future_id,parent_branch_id,fork_event_id,name,seed) VALUES($1,$2,$3,$4,$5,$6,$7)',
          [
            branchId,
            userId,
            option.future_id,
            option.parent_branch_id,
            option.event_id,
            option.payload.label,
            seed,
          ],
        );
        await tx.query(
          'INSERT INTO ff_decision_resolutions(id,user_id,decision_id,option_id,child_branch_id) VALUES($1,$2,$3,$4,$5)',
          [randomUUID(), userId, decisionId, optionId, branchId],
        );
        const payload: JobInput = {
          locale: option.content_locale,
          profile: option.snapshot,
          world: option.world,
          state,
          horizonMonths,
          seed,
          decision: {
            label: option.payload.label,
            constraints: option.payload.constraints,
          },
        };
        await tx.query(
          "INSERT INTO ff_jobs(id,user_id,branch_id,job_type,payload) VALUES($1,$2,$3,'branch',$4)",
          [jobId, userId, branchId, json(payload)],
        );
        return {
          newBranchId: branchId,
          futureId: option.future_id,
          jobId,
          status: 'queued',
        };
      },
    );
  }
  async listFutures(
    userId: string,
    locales: readonly Locale[] = supportedLocales,
  ) {
    return this.db.query(
      'SELECT f.id,f.title,f.status,f.root_branch_id,f.created_at,f.content_locale,j.id AS job_id FROM ff_futures f LEFT JOIN ff_jobs j ON j.branch_id=f.root_branch_id WHERE f.user_id=$1 AND f.content_locale=ANY($2::text[]) ORDER BY f.created_at DESC LIMIT 100',
      [userId, [...locales]],
    );
  }
  async future(userId: string, id: string) {
    const future = requireRow(
      await this.db.query<Row & { content_locale: Locale }>(
        'SELECT * FROM ff_futures WHERE id=$1 AND user_id=$2',
        [id, userId],
      ),
    );
    return {
      ...future,
      branches: await this.db.query(
        'SELECT b.id,b.parent_branch_id,b.name,b.status,j.id AS job_id FROM ff_branches b LEFT JOIN ff_jobs j ON j.branch_id=b.id WHERE b.future_id=$1 AND b.user_id=$2 ORDER BY b.created_at',
        [id, userId],
      ),
    };
  }
  async job(userId: string, id: string) {
    return requireRow(
      await this.db.query(
        'SELECT id,branch_id,status,stage,error_code,error_message_safe,attempt FROM ff_jobs WHERE id=$1 AND user_id=$2',
        [id, userId],
      ),
    );
  }
  async branch(userId: string, id: string) {
    const branch = requireRow(
      await this.db.query<
        Row & { id: string; name: string; content_locale: Locale }
      >(
        'SELECT b.id,b.future_id,b.parent_branch_id,b.fork_event_id,b.name,b.status,f.content_locale,j.id AS job_id FROM ff_branches b JOIN ff_futures f ON f.id=b.future_id LEFT JOIN ff_jobs j ON j.branch_id=b.id WHERE b.id=$1 AND b.user_id=$2',
        [id, userId],
      ),
    );
    const events = await this.timeline(userId, id);
    const decisions = await this.db.query<
      Row & { id: string; event_id: string; prompt: string }
    >(
      'SELECT id,event_id,prompt FROM ff_decisions WHERE branch_id=$1 AND user_id=$2',
      [id, userId],
    );
    const decisionsWithOptions = await Promise.all(
      decisions.map(async (decision) => ({
        ...decision,
        options: await this.db.query(
          'SELECT id,payload FROM ff_decision_options WHERE decision_id=$1 AND user_id=$2 ORDER BY option_key',
          [decision.id, userId],
        ),
      })),
    );
    return {
      ...branch,
      events,
      decisions: decisionsWithOptions,
      chapters: await this.db.query(
        'SELECT id,chapter_no,payload FROM ff_chapters WHERE branch_id=$1 AND user_id=$2 ORDER BY chapter_no',
        [id, userId],
      ),
    };
  }
  async timeline(userId: string, branchId: string): Promise<Row[]> {
    const rows = await this.db.query<
      Row & { parent_branch_id: string | null; fork_event_id: string | null }
    >(
      'SELECT parent_branch_id,fork_event_id FROM ff_branches WHERE id=$1 AND user_id=$2',
      [branchId, userId],
    );
    const branch = requireRow(rows);
    let prefix: Row[] = [];
    if (branch.parent_branch_id && branch.fork_event_id) {
      const fork = requireRow(
        await this.db.query(
          'SELECT effective_at::text FROM ff_events WHERE id=$1 AND user_id=$2',
          [branch.fork_event_id, userId],
        ),
      );
      prefix = (await this.timeline(userId, branch.parent_branch_id))
        .filter(
          (event) => String(event.effective_at) <= String(fork.effective_at),
        )
        .map((event) => ({ ...event, inherited: true }));
    }
    const local = await this.db.query(
      'SELECT id,branch_id,effective_at::text,canon FROM ff_events WHERE branch_id=$1 AND user_id=$2 ORDER BY sequence_no',
      [branchId, userId],
    );
    return [...prefix, ...local];
  }
  async exportAccount(userId: string) {
    return this.db.transaction(async (tx) => {
      await this.lockUser(tx, userId);
      const result: Record<string, unknown> = {
        exportVersion: CONTRACT_VERSION,
        lifeContractVersion: LIFE_CONTRACT_VERSION,
        publicDraftVersion: PUBLIC_DRAFT_VERSION,
        exportedAt: new Date().toISOString(),
      };
      const tables = [
        'ff_profile_drafts',
        'ff_profile_versions',
        'ff_world_versions',
        'ff_futures',
        'ff_branches',
        'ff_life_states',
        'ff_events',
        'ff_decisions',
        'ff_decision_options',
        'ff_decision_resolutions',
        'ff_chapters',
        'ff_consents',
        'ff_ai_runs',
        'aw_drafts',
        'aw_lives',
        'aw_branches',
        'aw_periods',
        'aw_history',
        'aw_choices',
        'aw_ai_runs',
        'aw_metrics',
        'aw_budget_accounts',
        'aw_budget_reservations',
        'aw_interactions',
        'aw_activity_sessions',
        'aw_feedback',
        'aw_publication_drafts',
        'aw_scenario_drafts',
      ];
      for (const table of tables)
        result[table] = await tx.query(
          `SELECT * FROM ${table} WHERE user_id=$1`,
          [userId],
        );
      const [publicReviewStorage] = await tx.query(
        "SELECT to_regclass('public.aw_public_draft_reviews') IS NOT NULL AS present",
      );
      result.aw_public_draft_reviews =
        publicReviewStorage?.present === true
          ? await tx.query(
              'SELECT * FROM aw_public_draft_reviews WHERE user_id=$1',
              [userId],
            )
          : [];
      const [publicReviewJobs] = await tx.query(
        "SELECT to_regclass('public.aw_public_review_jobs') IS NOT NULL AS present",
      );
      result.aw_public_review_jobs =
        publicReviewJobs?.present === true
          ? await tx.query(
              'SELECT * FROM aw_public_review_jobs WHERE user_id=$1',
              [userId],
            )
          : [];
      const [textCuration] = await tx.query(
        "SELECT to_regclass('public.aw_public_text_curations') IS NOT NULL AS present",
      );
      result.aw_public_text_curations =
        textCuration?.present === true
          ? await tx.query(
              'SELECT * FROM aw_public_text_curations WHERE user_id=$1',
              [userId],
            )
          : [];
      for (const table of [
        'aw_scenarios',
        'aw_scenario_versions',
        'aw_scenario_starts',
        'aw_scenario_reviews',
        'aw_scenario_curations',
        'aw_official_scenario_sources',
        'aw_official_life_starts',
        'aw_official_life_sources',
        'aw_public_fork_checkpoints',
        'aw_public_content_bundles',
        'aw_public_content_bundle_checkpoints',
        'aw_public_content_reviews',
        'aw_public_content_curations',
        'aw_publication_previews',
        'aw_publications',
        'aw_publication_actions',
        'aw_official_publication_previews',
        'aw_official_publications',
        'aw_official_publication_actions',
      ]) {
        const [storage] = await tx.query(
          'SELECT to_regclass($1) IS NOT NULL AS present',
          [`public.${table}`],
        );
        result[table] =
          storage?.present === true
            ? await tx.query(`SELECT * FROM ${table} WHERE user_id=$1`, [
                userId,
              ])
            : [];
      }
      const [savedStorage] = await tx.query(
        "SELECT to_regclass('public.aw_saved_lives') IS NOT NULL AS present",
      );
      // Own bookmark metadata only. Never export the foreign publisher ID,
      // provenance, withdrawn story text or a cached snapshot through a save.
      result.aw_saved_lives =
        savedStorage?.present === true
          ? await tx.query(
              `SELECT COALESCE(c.slug,o.slug) AS slug,s.created_at AS saved_at
         FROM aw_saved_lives s LEFT JOIN aw_publications c ON c.id=s.community_publication_id
         LEFT JOIN aw_official_publications o ON o.id=s.official_publication_id
         WHERE s.user_id=$1 ORDER BY s.created_at,s.id`,
              [userId],
            )
          : [];
      const [reportStorage] = await tx.query(
        "SELECT to_regclass('public.aw_public_reports') IS NOT NULL AS present",
      );
      result.aw_public_reports =
        reportStorage?.present === true
          ? await tx.query(
              `SELECT r.id,COALESCE(c.slug,o.slug) AS slug,r.reason,r.details,r.status,r.created_at
         FROM aw_public_reports r LEFT JOIN aw_publications c ON c.id=r.community_publication_id
         LEFT JOIN aw_official_publications o ON o.id=r.official_publication_id WHERE r.user_id=$1 ORDER BY r.created_at,r.id`,
              [userId],
            )
          : [];
      result.aw_public_warnings =
        reportStorage?.present === true
          ? await tx.query(
              'SELECT id,slug,reason,action,created_at FROM aw_public_warnings WHERE user_id=$1 ORDER BY created_at,id',
              [userId],
            )
          : [];
      result.aw_publication_restrictions =
        reportStorage?.present === true
          ? await tx.query(
              'SELECT active,revision,reason,updated_at FROM aw_publication_restrictions WHERE user_id=$1',
              [userId],
            )
          : [];
      result.aw_publication_restriction_actions =
        reportStorage?.present === true
          ? await tx.query(
              'SELECT active,revision,reason,created_at FROM aw_publication_restriction_actions WHERE user_id=$1 ORDER BY revision',
              [userId],
            )
          : [];
      const [metricsStorage] = await tx.query(
        "SELECT to_regclass('public.aw_public_metrics_daily') IS NOT NULL AS present",
      );
      // Publisher's aggregate activity only. No raw reading IDs or foreign publisher IDs.
      result.aw_public_metrics_daily =
        metricsStorage?.present === true
          ? await tx.query(
              `SELECT COALESCE(c.slug,o.slug) AS slug,m.day::text AS day,m.kind,m.total
          FROM aw_public_metrics_daily m LEFT JOIN aw_publications c ON c.id=m.community_publication_id
          LEFT JOIN aw_official_publications o ON o.id=m.official_publication_id
          WHERE c.user_id=$1 OR o.user_id=$1 ORDER BY m.day,slug,m.kind`,
              [userId],
            )
          : [];
      const [exposureStorage] = await tx.query(
        "SELECT to_regclass('public.aw_public_exposures') IS NOT NULL AS present",
      );
      result.aw_public_exposures =
        exposureStorage?.present === true
          ? await tx.query(
              `SELECT COALESCE(c.slug,o.slug) AS slug,e.publication_revision,e.snapshot_hash,e.permission_revision,e.mode,e.created_at,e.updated_at
        FROM aw_public_exposures e LEFT JOIN aw_publications c ON c.id=e.community_publication_id LEFT JOIN aw_official_publications o ON o.id=e.official_publication_id
        WHERE c.user_id=$1 OR o.user_id=$1 ORDER BY slug`,
              [userId],
            )
          : [];
      result.aw_public_exposure_actions =
        exposureStorage?.present === true
          ? await tx.query(
              `SELECT COALESCE(c.slug,o.slug) AS slug,a.permission_revision,a.publication_revision,a.snapshot_hash,a.mode,a.created_at
        FROM aw_public_exposure_actions a JOIN aw_public_exposures e ON e.id=a.exposure_id LEFT JOIN aw_publications c ON c.id=e.community_publication_id LEFT JOIN aw_official_publications o ON o.id=e.official_publication_id
        WHERE c.user_id=$1 OR o.user_id=$1 ORDER BY slug,a.permission_revision`,
              [userId],
            )
          : [];
      const [forkPermissionStorage] = await tx.query(
        "SELECT to_regclass('public.aw_public_fork_starts') IS NOT NULL AS present",
      );
      result.aw_public_fork_starts = forkPermissionStorage?.present
        ? await tx.query(
            `SELECT s.life_id,s.branch_id,s.source_kind,COALESCE(c.slug,o.slug) AS source_slug,s.capability_hash,s.permission_revision,s.checkpoint_index,s.checkpoint_hash,s.option_key,s.created_at FROM aw_public_fork_starts s LEFT JOIN aw_publications c ON c.id=s.community_publication_id LEFT JOIN aw_official_publications o ON o.id=s.official_publication_id WHERE s.user_id=$1 ORDER BY s.created_at,s.life_id`,
            [userId],
          )
        : [];
      result.aw_initial_choices = forkPermissionStorage?.present
        ? await tx.query(
            'SELECT life_id,branch_id,decision_id,option_id,prompt,payload,state_before,state_after,created_at FROM aw_initial_choices WHERE user_id=$1 ORDER BY created_at,life_id',
            [userId],
          )
        : [];
      const [forkConsentStorage] = await tx.query(
        "SELECT to_regclass('public.aw_public_fork_permissions') IS NOT NULL AS present",
      );
      result.aw_public_fork_permissions = forkConsentStorage?.present
        ? await tx.query(
            `SELECT COALESCE(c.slug,o.slug) AS slug,f.publication_revision,f.snapshot_hash,f.permission_revision,f.allowed,f.created_at,f.updated_at
         FROM aw_public_fork_permissions f LEFT JOIN aw_publications c ON c.id=f.community_publication_id LEFT JOIN aw_official_publications o ON o.id=f.official_publication_id
         WHERE c.user_id=$1 OR o.user_id=$1 ORDER BY slug`,
            [userId],
          )
        : [];
      result.aw_public_fork_permission_actions = forkConsentStorage?.present
        ? await tx.query(
            `SELECT COALESCE(c.slug,o.slug) AS slug,a.permission_revision,a.publication_revision,a.snapshot_hash,a.allowed,a.created_at
         FROM aw_public_fork_permission_actions a JOIN aw_public_fork_permissions f ON f.id=a.permission_id LEFT JOIN aw_publications c ON c.id=f.community_publication_id LEFT JOIN aw_official_publications o ON o.id=f.official_publication_id
         WHERE c.user_id=$1 OR o.user_id=$1 ORDER BY slug,a.permission_revision`,
            [userId],
          )
        : [];
      const [publicationRefreshStorage] = await tx.query(
        "SELECT to_regclass('public.aw_publication_refreshes') IS NOT NULL AS present",
      );
      result.aw_publication_refreshes =
        publicationRefreshStorage?.present === true
          ? await tx.query(
              'SELECT id,classification,previous_community_id,next_community_id,previous_official_id,next_official_id,previous_revision,previous_snapshot_hash,preview_id,preview_hash,created_at FROM aw_publication_refreshes WHERE user_id=$1 ORDER BY created_at,id',
              [userId],
            )
          : [];
      const [admissionStorage] = await tx.query(
        "SELECT to_regclass('public.aw_deleted_life_admissions') IS NOT NULL AS present",
      );
      result.aw_deleted_life_admissions = admissionStorage?.present
        ? await tx.query(
            'SELECT kind,admitted_at FROM aw_deleted_life_admissions WHERE user_id=$1 ORDER BY admitted_at,kind',
            [userId],
          )
        : [];
      result.account = await tx.query(
        'SELECT id,status,created_at FROM ff_users WHERE id=$1',
        [userId],
      );
      result.ff_chapter_events = await tx.query(
        'SELECT ce.* FROM ff_chapter_events ce JOIN ff_chapters c ON c.id=ce.chapter_id WHERE c.user_id=$1',
        [userId],
      );
      result.sharedContextContractVersion = '1.0.0';
      result.shared = await exportSharedAccount(tx, userId);
      result.sharedSafety = await exportSharedSafety(tx, userId);
      return result;
    });
  }
  async markDeleting(userId: string) {
    await this.db.transaction(async (tx) => {
      await this.lockUser(tx, userId);
      await tx.query("UPDATE ff_users SET status='deleting' WHERE id=$1", [
        userId,
      ]);
      await tx.query(
        "INSERT INTO aw_account_deletions(user_id,status) VALUES($1,'awaiting_auth') ON CONFLICT(user_id) DO NOTHING",
        [userId],
      );
      await tx.query(
        "UPDATE ff_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL WHERE user_id=$1 AND status IN ('queued','running','validating')",
        [userId],
      );
      await tx.query(
        "UPDATE aw_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL WHERE user_id=$1 AND status IN ('queued','running')",
        [userId],
      );
      await cancelSharedAccountJobs(tx, userId);
      const [scenarioRelease] = await tx.query(
        "SELECT to_regclass('public.aw_scenario_reviews') IS NOT NULL AS present",
      );
      if (scenarioRelease?.present === true) {
        await tx.query(
          "UPDATE aw_scenario_reviews SET status='cancelled',lease_token=NULL,lease_until=NULL,finished_at=now() WHERE user_id=$1 AND status='running'",
          [userId],
        );
        await tx.query(
          "UPDATE aw_official_scenario_sources SET status='revoked',revoked_at=now(),revoke_reason='account_deletion',revoke_actor='Account deletion' WHERE user_id=$1 AND status='active'",
          [userId],
        );
      }
      const [publications] = await tx.query(
        "SELECT to_regclass('public.aw_publications') IS NOT NULL AS present",
      );
      const [officialLives] = await tx.query(
        "SELECT to_regclass('public.aw_official_life_sources') IS NOT NULL AS present",
      );
      if (officialLives?.present === true)
        await tx.query(
          "UPDATE aw_official_life_sources SET status='revoked',revoked_at=now(),revoke_reason='account_deletion',revoke_actor='Account deletion' WHERE user_id=$1 AND status='active'",
          [userId],
        );
      if (publications?.present === true) {
        const withdrawn = await tx.query<{ id: string; revision: number }>(
          "UPDATE aw_publications SET status='withdrawn',revision=revision+1,token_hash=NULL WHERE user_id=$1 AND status IN ('active','hidden') RETURNING id,revision",
          [userId],
        );
        for (const publication of withdrawn)
          await tx.query(
            "INSERT INTO aw_publication_actions(id,user_id,publication_id,revision,action,reason_code,actor_label) VALUES($1,$2,$3,$4,'withdraw','account_deletion','Account deletion')",
            [randomUUID(), userId, publication.id, publication.revision],
          );
      }
      const [contentReviews] = await tx.query(
        "SELECT to_regclass('public.aw_public_content_reviews') IS NOT NULL AS present",
      );
      if (contentReviews?.present === true)
        await tx.query(
          "UPDATE aw_public_content_reviews SET status='cancelled',lease_token=NULL,lease_until=NULL,finished_at=now(),failure_code='PUBLIC_CONTENT_REVIEW_INTERRUPTED' WHERE user_id=$1 AND status IN ('queued','running')",
          [userId],
        );
      const [reviewJobs] = await tx.query(
        "SELECT to_regclass('public.aw_public_review_jobs') IS NOT NULL AS present",
      );
      if (reviewJobs?.present === true) {
        await tx.query(
          "UPDATE aw_public_review_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL,finished_at=now() WHERE user_id=$1 AND status IN ('queued','running')",
          [userId],
        );
        await tx.query(
          "UPDATE aw_public_draft_reviews SET status='failed',failure_code='PUBLIC_REVIEW_INTERRUPTED',finished_at=now() WHERE user_id=$1 AND status='running' AND id IN (SELECT review_id FROM aw_public_review_jobs WHERE user_id=$1 AND status='cancelled')",
          [userId],
        );
      }
    });
  }
  async restoreActive(userId: string) {
    await this.db.transaction(async (tx) => {
      await tx.query("UPDATE ff_users SET status='active' WHERE id=$1", [
        userId,
      ]);
      await tx.query(
        "DELETE FROM aw_account_deletions WHERE user_id=$1 AND status='awaiting_auth'",
        [userId],
      );
      await tx.query(
        "UPDATE aw_jobs SET status='failed',error_code='ACCOUNT_DELETION_CANCELLED' WHERE user_id=$1 AND status='cancelled'",
        [userId],
      );
      await tx.query(
        "UPDATE aw_branches SET status='failed' WHERE user_id=$1 AND status='generating'",
        [userId],
      );
    });
  }
  async confirmAuthDeleted(userId: string) {
    await this.db.query(
      "UPDATE aw_account_deletions SET status='auth_deleted',auth_deleted_at=now() WHERE user_id=$1",
      [userId],
    );
  }
  async deleteAccountData(userId: string) {
    await this.db.query('DELETE FROM ff_users WHERE id=$1', [userId]);
  }
}
