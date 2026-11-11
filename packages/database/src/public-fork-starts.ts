import {
  publicExposureSlugSchema,
  publicForkStartRequestSchema,
  publicForkStartReceiptSchema,
  publicForkAttributionSchema,
} from '@future-flow/contracts';
import {
  DomainError,
  hash,
  instantiateForkCheckpoint,
} from '@future-flow/core';
import { LifeRepository, lifeRow } from './lives';
import {
  PublicForkPermissionRepository,
  type PublicForkPermissionConfig,
} from './public-fork-permissions';
import type { PublicationConfig } from './publications';
import type { Database } from './index';
type Row = Record<string, unknown>;
const off = { enabled: false, linkSecret: '' };
const missing = () =>
  new DomainError(
    'RESOURCE_NOT_FOUND',
    'This starting point is unavailable.',
    404,
  );
export class PublicForkStartRepository {
  private readonly permissions: PublicForkPermissionRepository;
  constructor(
    public readonly db: Database,
    private readonly config: PublicForkPermissionConfig = {
      enabled: false,
      startsEnabled: false,
    },
    private readonly community: PublicationConfig = off,
    private readonly official: PublicationConfig = off,
    private readonly limits = { daily: 10, concurrent: 2 },
  ) {
    this.permissions = new PublicForkPermissionRepository(
      db,
      config,
      community,
      official,
    );
  }
  private table(slug: string) {
    return slug.startsWith('official-')
      ? 'aw_official_publications'
      : 'aw_publications';
  }
  private async hint(slug: string) {
    return (
      await this.db.query<{ user_id: string }>(
        `SELECT user_id FROM ${this.table(slug)} WHERE slug=$1`,
        [slug],
      )
    )[0];
  }
  async start(userId: string, rawSlug: unknown, raw: unknown, key: string) {
    const slug = publicExposureSlugSchema.parse(rawSlug),
      input = publicForkStartRequestSchema.parse(raw),
      scope = 'v2:public-fork:' + slug,
      inputHash = hash(input);
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(key))
      throw new DomainError(
        'IDEMPOTENCY_KEY_REQUIRED',
        'Request key required.',
        400,
      );
    const hint = await this.hint(slug);
    return this.db.transaction(async (tx) => {
      const users = await tx.query<{ id: string; status: string }>(
        'SELECT id,status FROM ff_users WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
        [[...new Set([userId, ...(hint ? [hint.user_id] : [])])].sort()],
      );
      if (!users.some((u) => u.id === userId && u.status === 'active'))
        throw missing();
      const [old] = await tx.query<{ input_hash: string; response: unknown }>(
        'SELECT input_hash,response FROM ff_idempotency WHERE user_id=$1 AND scope=$2 AND key=$3',
        [userId, scope, key],
      );
      if (old) {
        if (old.input_hash !== inputHash)
          throw new DomainError(
            'IDEMPOTENCY_CONFLICT',
            'This request key has different choices.',
            409,
          );
        if ((old.response as { deleted?: boolean } | null)?.deleted === true)
          throw new DomainError(
            'PUBLIC_FORK_START_DELETED',
            'This private life was deleted. A new life requires a new explicit request.',
            410,
          );
        const receipt = publicForkStartReceiptSchema.parse(old.response);
        lifeRow(
          await tx.query('SELECT id FROM aw_lives WHERE id=$1 AND user_id=$2', [
            receipt.lifeId,
            userId,
          ]),
        );
        return receipt;
      }
      if (!this.config.enabled || !this.config.startsEnabled)
        throw new DomainError(
          'PUBLIC_FORK_START_DISABLED',
          'Starting private lives from public stories is not open yet.',
          404,
        );
      if (
        !hint ||
        !users.some((u) => u.id === hint.user_id && u.status === 'active')
      )
        throw missing();
      const copy = await this.permissions.lockedCopy(tx, slug);
      if (copy.user_id !== hint.user_id) throw missing();
      const permissionRepo = new PublicForkPermissionRepository(
        tx,
        this.config,
        this.community,
        this.official,
      );
      const capability = await permissionRepo.capability(slug);
      if (capability.capabilityHash !== input.capabilityHash)
        throw new DomainError(
          'PUBLIC_FORK_START_CONFLICT',
          'The published copy or permission changed. Reload the decision points.',
          409,
        );
      const reader = await this.permissions.read(tx, slug),
        checkpoint = reader.snapshot.checkpoints[input.checkpointIndex];
      if (
        !checkpoint ||
        !checkpoint.decision.options.some((o) => o.key === input.optionKey)
      )
        throw new DomainError(
          'PUBLIC_FORK_START_CONFLICT',
          'Choose an available decision point and option.',
          409,
        );
      const prepared = instantiateForkCheckpoint(
          {
            ...checkpoint,
            schemaVersion: 'fork-checkpoint-1',
            requiresFullReview: true,
            readyForPublicFork: false,
          },
          input.optionKey,
        ),
        created = await new LifeRepository(tx, this.limits).createPreparedFork(
          userId,
          prepared,
          hash({ scope, key }),
        );
      await tx.query(
        `INSERT INTO aw_public_fork_starts(user_id,life_id,branch_id,source_kind,${slug.startsWith('official-') ? 'official_publication_id' : 'community_publication_id'},capability_hash,permission_revision,checkpoint_index,checkpoint_hash,option_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          userId,
          created.lifeId,
          created.branchId,
          capability.classification,
          copy.id,
          capability.capabilityHash,
          capability.permissionRevision,
          input.checkpointIndex,
          hash(checkpoint),
          input.optionKey,
        ],
      );
      const receipt = publicForkStartReceiptSchema.parse({
        schemaVersion: 'public-fork-start-1',
        ...created,
      });
      await tx.query(
        'INSERT INTO ff_idempotency(user_id,scope,key,input_hash,response) VALUES($1,$2,$3,$4,$5)',
        [userId, scope, key, inputHash, JSON.stringify(receipt)],
      );
      return receipt;
    });
  }
  async attribution(userId: string, rawLifeId: unknown) {
    const lifeId = publicForkStartReceiptSchema.shape.lifeId.parse(rawLifeId);
    const [hint] = await this.db.query<{ source_user_id: string | null }>(
      `SELECT COALESCE(c.user_id,o.user_id) AS source_user_id FROM aw_public_fork_starts s LEFT JOIN aw_publications c ON c.id=s.community_publication_id LEFT JOIN aw_official_publications o ON o.id=s.official_publication_id WHERE s.life_id=$1 AND s.user_id=$2`,
      [lifeId, userId],
    );
    return this.db.transaction(async (tx) => {
      const users = await tx.query<{ id: string; status: string }>(
        'SELECT id,status FROM ff_users WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE',
        [
          [
            ...new Set([
              userId,
              ...(hint?.source_user_id ? [hint.source_user_id] : []),
            ]),
          ].sort(),
        ],
      );
      if (!users.some((u) => u.id === userId && u.status === 'active'))
        throw missing();
      const [start] = await tx.query<Row & { slug: string | null }>(
        `SELECT s.*,COALESCE(c.slug,o.slug) AS slug FROM aw_public_fork_starts s LEFT JOIN aw_publications c ON c.id=s.community_publication_id LEFT JOIN aw_official_publications o ON o.id=s.official_publication_id WHERE s.life_id=$1 AND s.user_id=$2 FOR SHARE OF s`,
        [lifeId, userId],
      );
      if (!start) throw missing();
      let source: unknown = null;
      if (
        start.slug &&
        hint?.source_user_id &&
        users.some((u) => u.id === hint.source_user_id && u.status === 'active')
      )
        try {
          const r = await this.permissions.read(tx, start.slug);
          source = {
            slug: r.slug,
            title: r.snapshot.story.title,
            classification: r.snapshot.classification,
          };
        } catch (e) {
          if (!(e instanceof DomainError && e.status === 404)) throw e;
        }
      return publicForkAttributionSchema.parse({
        schemaVersion: 'public-fork-start-1',
        lifeId,
        origin: 'public_checkpoint',
        source,
      });
    });
  }
}
