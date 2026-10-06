import { DomainError, hash } from '@future-flow/core';
import {
  publicLifeSlugSchema,
  publicReportRequestSchema,
  publicReportReceiptSchema,
  publicReportModerationSchema,
  publicRestrictionRequestSchema,
  publicSafetyViewSchema,
} from '@future-flow/contracts';
import type { Database } from './index';
import { PublicationRepository, type PublicationConfig } from './publications';
import { OfficialPublicationRepository } from './official-publications';
export interface PublicReportsConfig {
  enabled: boolean;
}
export function publicReportsConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): PublicReportsConfig {
  const value = env.PUBLIC_REPORTS_ENABLED ?? 'false';
  if (!['true', 'false'].includes(value))
    throw Error('Invalid public reports flag');
  return { enabled: value === 'true' };
}
type Report = {
  id: string;
  user_id: string;
  community_publication_id: string | null;
  official_publication_id: string | null;
  reason: string;
  details: string;
  created_at: Date | string;
  status: string;
  revision: number;
  decision_hash: string | null;
};
const off = { enabled: false, linkSecret: '' },
  missing = () =>
    new DomainError(
      'RESOURCE_NOT_FOUND',
      'This public copy is unavailable.',
      404,
    ),
  conflict = () =>
    new DomainError(
      'PUBLIC_MODERATION_CONFLICT',
      'Moderation revision changed.',
      409,
    );
export class PublicSafetyRepository {
  constructor(
    private readonly db: Database,
    private readonly config: PublicReportsConfig = { enabled: false },
    private readonly community: PublicationConfig = off,
    private readonly official: PublicationConfig = off,
  ) {}
  private target(slug: string) {
    return slug.startsWith('official-')
      ? { table: 'aw_official_publications', column: 'official_publication_id' }
      : { table: 'aw_publications', column: 'community_publication_id' };
  }
  private async owner(tx: Database, id: string, write = false) {
    const [row] = await tx.query<{ status: string }>(
      `SELECT status FROM ff_users WHERE id=$1 FOR ${write ? 'UPDATE' : 'SHARE'}`,
      [id],
    );
    if (row?.status !== 'active') throw missing();
  }
  private receipt(row: Report, slug: string, duplicate: boolean) {
    return publicReportReceiptSchema.parse({
      schemaVersion: 'public-safety-1',
      reportId: row.id,
      slug,
      reason: row.reason,
      createdAt: new Date(row.created_at).toISOString(),
      status: row.status,
      received: true,
      duplicate,
    });
  }
  async report(userId: string, rawSlug: unknown, raw: unknown) {
    if (!this.config.enabled)
      throw new DomainError(
        'PUBLIC_REPORTS_DISABLED',
        'Public reports are unavailable.',
        404,
      );
    const slug = publicLifeSlugSchema.parse(rawSlug),
      input = publicReportRequestSchema.parse(raw),
      target = this.target(slug);
    return this.db.transaction(async (tx) => {
      const [seed] = await tx.query<{ id: string; user_id: string }>(
        `SELECT id,user_id FROM ${target.table} WHERE slug=$1 AND visibility='public' AND status='active'`,
        [slug],
      );
      if (!seed) throw missing();
      for (const id of [...new Set([userId, seed.user_id])].sort())
        await this.owner(tx, id, id === userId);
      const reader = slug.startsWith('official-')
        ? await new OfficialPublicationRepository(tx, this.official).readPublic(
            slug,
          )
        : await new PublicationRepository(tx, this.community).readPublic(slug);
      if (reader.snapshot.contentLocale !== 'en') throw missing();
      const [prior] = await tx.query<Report>(
        `SELECT * FROM aw_public_reports WHERE user_id=$1 AND ${target.column}=$2 AND reason=$3`,
        [userId, seed.id, input.reason],
      );
      if (prior) return this.receipt(prior, slug, true);
      const [count] = await tx.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM aw_public_reports WHERE user_id=$1 AND created_at>now()-interval '24 hours'",
        [userId],
      );
      if (Number(count?.count) >= 10)
        throw new DomainError(
          'PUBLIC_REPORT_LIMIT',
          'Report limit reached.',
          429,
        );
      const [row] = await tx.query<Report>(
        `INSERT INTO aw_public_reports(user_id,${target.column},reason,details) VALUES($1,$2,$3,$4) RETURNING *`,
        [userId, seed.id, input.reason, input.details],
      );
      return this.receipt(row!, slug, false);
    });
  }
  async ownSafety(userId: string) {
    return this.db.transaction(async (tx) => {
      await this.owner(tx, userId);
      const [restriction] = await tx.query<{
        active: boolean;
        revision: number;
      }>(
        'SELECT active,revision FROM aw_publication_restrictions WHERE user_id=$1',
        [userId],
      );
      const rows = await tx.query<{
        id: string;
        slug: string;
        reason: string;
        action: string;
        created_at: Date | string;
      }>(
        'SELECT id,slug,reason,action,created_at FROM aw_public_warnings WHERE user_id=$1 ORDER BY created_at DESC,id LIMIT 20',
        [userId],
      );
      return publicSafetyViewSchema.parse({
        schemaVersion: 'public-safety-1',
        publishingRestricted: restriction?.active ?? false,
        restrictionRevision: restriction?.revision ?? 0,
        warnings: rows.map((r) => ({
          id: r.id,
          slug: r.slug,
          reason: r.reason,
          action: r.action,
          createdAt: new Date(r.created_at).toISOString(),
        })),
      });
    });
  }
  // Trusted CLI only. No report-detail, moderator or restriction HTTP endpoint.
  async queue() {
    return this.db
      .query(`SELECT r.id AS "reportId",r.revision AS "reportRevision",r.reason,r.details,r.created_at AS "createdAt",
      COALESCE(c.slug,o.slug) AS slug,COALESCE(c.user_id,o.user_id) AS "ownerId",
      COALESCE(c.revision,o.revision) AS "publicationRevision",COALESCE(c.snapshot_hash,o.snapshot_hash) AS "snapshotHash",
      COALESCE(c.status,o.status) AS "publicationStatus",
      (SELECT count(*)::int FROM aw_public_warnings w WHERE w.user_id=COALESCE(c.user_id,o.user_id)) AS "ownerWarningCount"
      FROM aw_public_reports r LEFT JOIN aw_publications c ON c.id=r.community_publication_id
      LEFT JOIN aw_official_publications o ON o.id=r.official_publication_id
      WHERE r.status='queued' ORDER BY r.created_at,r.id LIMIT 100`);
  }
  private async restrict(
    tx: Database,
    userId: string,
    active: boolean,
    reason: string,
    actor: string,
  ) {
    const [row] = await tx.query<{ revision: number }>(
      'INSERT INTO aw_publication_restrictions(user_id,active,revision,reason,actor_label) VALUES($1,$2,1,$3,$4) ON CONFLICT(user_id) DO UPDATE SET active=EXCLUDED.active,revision=aw_publication_restrictions.revision+1,reason=EXCLUDED.reason,actor_label=EXCLUDED.actor_label,updated_at=now() RETURNING revision',
      [userId, active, reason, actor],
    );
    await tx.query(
      'INSERT INTO aw_publication_restriction_actions(user_id,active,revision,reason,actor_label) VALUES($1,$2,$3,$4,$5)',
      [userId, active, row!.revision, reason, actor],
    );
    return row!.revision;
  }
  async setRestriction(raw: unknown) {
    const input = publicRestrictionRequestSchema.parse(raw);
    return this.db.transaction(async (tx) => {
      await this.owner(tx, input.userId, true);
      const [row] = await tx.query<{
        active: boolean;
        revision: number;
        reason: string;
        actor_label: string;
      }>(
        'SELECT * FROM aw_publication_restrictions WHERE user_id=$1 FOR UPDATE',
        [input.userId],
      );
      if (
        row?.revision === input.revision + 1 &&
        row.active === input.active &&
        row.reason === input.reasonCode &&
        row.actor_label === input.actorLabel
      )
        return { active: row.active, revision: row.revision };
      if ((row?.revision ?? 0) !== input.revision) throw conflict();
      const revision = await this.restrict(
        tx,
        input.userId,
        input.active,
        input.reasonCode,
        input.actorLabel,
      );
      return { active: input.active, revision };
    });
  }
  async resolve(raw: unknown) {
    const input = publicReportModerationSchema.parse(raw),
      decisionHash = hash(input);
    return this.db.transaction(async (tx) => {
      const [seed] = await tx.query<Report>(
        'SELECT * FROM aw_public_reports WHERE id=$1',
        [input.reportId],
      );
      if (!seed) throw missing();
      const target = seed.official_publication_id
          ? this.target('official-')
          : this.target('life-'),
        id = seed.official_publication_id ?? seed.community_publication_id;
      const [first] = await tx.query<{ user_id: string }>(
        `SELECT user_id FROM ${target.table} WHERE id=$1`,
        [id],
      );
      if (!first) throw missing();
      await this.owner(tx, first.user_id, true);
      const [copy] = await tx.query<{
        id: string;
        user_id: string;
        slug: string;
        revision: number;
        snapshot_hash: string;
      }>(
        `SELECT id,user_id,slug,revision,snapshot_hash FROM ${target.table} WHERE id=$1 FOR UPDATE`,
        [id],
      );
      const [report] = await tx.query<Report>(
        'SELECT * FROM aw_public_reports WHERE id=$1 FOR UPDATE',
        [seed.id],
      );
      if (!copy || !report) throw missing();
      if (report.status === 'resolved') {
        if (report.decision_hash !== decisionHash) throw conflict();
        return {
          reportId: report.id,
          status: 'resolved',
          action: input.action,
        };
      }
      if (
        report.revision !== input.reportRevision ||
        copy.revision !== input.publicationRevision ||
        copy.snapshot_hash !== input.snapshotHash
      )
        throw conflict();
      if (input.action === 'hide' || input.action === 'remove') {
        const repo = seed.official_publication_id
          ? new OfficialPublicationRepository(tx)
          : new PublicationRepository(tx);
        await repo.moderate({
          publicationId: copy.id,
          revision: copy.revision,
          snapshotHash: copy.snapshot_hash,
          acknowledged: true,
          action: input.action,
          reasonCode:
            input.reasonCode === 'personal_data' ? 'privacy' : 'content',
          actorLabel: input.actorLabel,
        });
      }
      if (input.action !== 'dismiss')
        await tx.query(
          'INSERT INTO aw_public_warnings(user_id,report_id,slug,reason,action,actor_label) VALUES($1,$2,$3,$4,$5,$6)',
          [
            copy.user_id,
            report.id,
            copy.slug,
            input.reasonCode,
            input.action,
            input.actorLabel,
          ],
        );
      if (input.restrictPublishing)
        await this.restrict(
          tx,
          copy.user_id,
          true,
          input.reasonCode,
          input.actorLabel,
        );
      await tx.query(
        "UPDATE aw_public_reports SET status='resolved',revision=revision+1,decision=$1,decision_hash=$2,resolved_at=now() WHERE id=$3",
        [JSON.stringify(input), decisionHash, report.id],
      );
      return { reportId: report.id, status: 'resolved', action: input.action };
    });
  }
}
