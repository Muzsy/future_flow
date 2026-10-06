import { DomainError } from '@future-flow/core';
import {
  publicLifeSlugSchema,
  publicReadingStartSchema,
  publicReadingSessionSchema,
  publicReadingSignalSchema,
  publicReadingReceiptSchema,
} from '@future-flow/contracts';
import type { Database } from './index';
import { PublicationRepository, type PublicationConfig } from './publications';
import { OfficialPublicationRepository } from './official-publications';
import {
  recordPublicMetric,
  type PublicMetricsConfig,
  type PublicMetricTarget,
} from './public-metric-recording';
const off = { enabled: false, linkSecret: '' };
const missing = () =>
  new DomainError('RESOURCE_NOT_FOUND', 'This reading is unavailable.', 404);
type Session = {
  id: string;
  community_publication_id: string | null;
  official_publication_id: string | null;
  created_at: Date | string;
  expires_at: Date | string;
  signals: number;
  alive: boolean;
  end_ready: boolean;
};
export class PublicMetricsRepository {
  constructor(
    private readonly db: Database,
    private readonly config: PublicMetricsConfig = { enabled: false },
    private readonly community: PublicationConfig = off,
    private readonly official: PublicationConfig = off,
  ) {}
  private enabled() {
    if (!this.config.enabled)
      throw new DomainError(
        'PUBLIC_METRICS_DISABLED',
        'Reading measurements are unavailable.',
        404,
      );
  }
  private async target(
    tx: Database,
    slug: string,
  ): Promise<PublicMetricTarget> {
    const official = slug.startsWith('official-'),
      reader = official
        ? await new OfficialPublicationRepository(tx, this.official).readPublic(
            slug,
          )
        : await new PublicationRepository(tx, this.community).readPublic(slug);
    if (reader.snapshot.contentLocale !== 'en') throw missing();
    const [row] = await tx.query<{ id: string }>(
      `SELECT id FROM ${official ? 'aw_official_publications' : 'aw_publications'} WHERE slug=$1`,
      [slug],
    );
    if (!row) throw missing();
    return { id: row.id, classification: official ? 'official' : 'community' };
  }
  async start(rawSlug: unknown, raw: unknown) {
    this.enabled();
    const slug = publicLifeSlugSchema.parse(rawSlug),
      input = publicReadingStartSchema.parse(raw);
    return this.db.transaction(async (tx) => {
      const target = await this.target(tx, slug),
        column =
          target.classification === 'official'
            ? 'official_publication_id'
            : 'community_publication_id';
      const [prior] = await tx.query<Session>(
        'SELECT *,expires_at>now() AS alive FROM aw_public_reading_sessions WHERE id=$1',
        [input.readingId],
      );
      if (prior) {
        if (prior[column] !== target.id || !prior.alive) throw missing();
        return this.view(prior, slug);
      }
      // Insert first to serialize the client UUID, then count only a new read.
      const [inserted] = await tx.query<Session>(
        `INSERT INTO aw_public_reading_sessions(id,${column}) VALUES($1,$2) ON CONFLICT(id) DO NOTHING RETURNING *`,
        [input.readingId, target.id],
      );
      if (!inserted) {
        const [existing] = await tx.query<Session>(
          'SELECT *,expires_at>now() AS alive FROM aw_public_reading_sessions WHERE id=$1',
          [input.readingId],
        );
        if (!existing || existing[column] !== target.id || !existing.alive)
          throw missing();
        return this.view(existing, slug);
      }
      // The counter row is the shared per-copy daily admission semaphore.
      const [counter] = await tx.query<{ total: number }>(
        `INSERT INTO aw_public_metrics_daily(${column},kind,total) VALUES($1,'reading_started',1) ON CONFLICT(${column},day,kind) DO UPDATE SET total=aw_public_metrics_daily.total+1 WHERE aw_public_metrics_daily.total<10000 RETURNING total`,
        [target.id],
      );
      if (!counter)
        throw new DomainError(
          'PUBLIC_METRICS_LIMIT',
          'Reading measurement limit reached.',
          429,
        );
      await tx.query(
        "DELETE FROM aw_public_reading_sessions WHERE id IN (SELECT id FROM aw_public_reading_sessions WHERE expires_at<now()-interval '24 hours' ORDER BY expires_at LIMIT 100)",
      );
      return this.view(inserted, slug);
    });
  }
  private view(row: Session, slug: string) {
    return publicReadingSessionSchema.parse({
      schemaVersion: 'public-metrics-1',
      readingId: row.id,
      slug,
      expiresAt: new Date(row.expires_at).toISOString(),
    });
  }
  async signal(rawSlug: unknown, raw: unknown) {
    this.enabled();
    const slug = publicLifeSlugSchema.parse(rawSlug),
      input = publicReadingSignalSchema.parse(raw),
      bits = {
        depth_25: 1,
        depth_50: 2,
        depth_75: 4,
        end_reached: 8,
        share_clicked: 16,
        link_copied: 32,
        copy_failed: 64,
      };
    return this.db.transaction(async (tx) => {
      const target = await this.target(tx, slug),
        column =
          target.classification === 'official'
            ? 'official_publication_id'
            : 'community_publication_id';
      const [row] = await tx.query<Session>(
        "SELECT *,expires_at>now() AS alive,created_at<=now()-interval '30 seconds' AS end_ready FROM aw_public_reading_sessions WHERE id=$1 FOR UPDATE",
        [input.readingId],
      );
      if (!row || row[column] !== target.id || !row.alive) throw missing();
      if (input.signal === 'end_reached' && !row.end_ready)
        throw new DomainError(
          'PUBLIC_READING_TOO_EARLY',
          'Reading end is not yet measurable.',
          409,
        );
      const bit = bits[input.signal],
        duplicate = (row.signals & bit) !== 0;
      if (!duplicate) {
        await tx.query(
          'UPDATE aw_public_reading_sessions SET signals=signals|$1 WHERE id=$2',
          [bit, row.id],
        );
        await recordPublicMetric(tx, target, input.signal, this.config);
      }
      return publicReadingReceiptSchema.parse({ received: true, duplicate });
    });
  }
}
