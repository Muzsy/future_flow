import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import {
  sharedCreateRequestSchema,
  sharedInviteRequestSchema,
  sharedAcceptRequestSchema,
  sharedInviteTokenSchema,
  socialProfileSchema,
  sharedTierSchema,
  type SharedCreateRequest,
  type SharedInviteRequest,
  type SharedAcceptRequest,
  type SharedContextType,
  type SharedTier,
  type SharedState,
  type InteractionProfile,
} from '@future-flow/contracts';
import {
  DomainError,
  hash,
  SHARED_MEMBER_LIMITS,
  SHARED_TIER_LIMITS,
  requireSharedEntitlement,
  sharedTimeAnchor,
  minimalInteractionProfile,
} from '@future-flow/core';
import type { Database } from './index';
import { cancelPendingSharedDecision, exportSharedCanon } from './shared-canon';
import { exportPersonalSharedMemories } from './shared-personal';
import { sharedContextPrivacy, projectSharedState } from './shared-privacy';

type Row = Record<string, unknown>;
type Context = Row & {
  id: string;
  type: SharedContextType;
  title: string;
  status: string;
  content_locale: 'en';
  state: SharedState;
  governance: unknown;
  revision: number;
  simulation_at: string;
  pending_event_id: string | null;
  moderation_hold: boolean;
};
type Member = Row & {
  id: string;
  user_id: string | null;
  branch_id: string | null;
  life_id: string | null;
  status: string;
  admin_role: string;
  interaction_profile: InteractionProfile;
  world_role: string | null;
};
type Invite = Row & {
  id: string;
  context_id: string;
  inviter_member_id: string;
  target_user_id: string | null;
  token_hash: string;
  status: string;
  expires_at: Date | string;
};
const liveStatuses = ['active', 'paused_entitlement'];
function fail(code: string, status = 409): never {
  throw new DomainError(code, code, status);
}
const tokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');
export class SharedContextRepository {
  constructor(
    public readonly db: Database,
    private readonly inviteSecret?: string,
  ) {}
  private token(inviteId: string) {
    if (!this.inviteSecret || !/^[a-f0-9]{64}$/.test(this.inviteSecret))
      fail('SHARED_INVITE_CONFIG', 503);
    // A 256-bit PRF token permits retries without storing the bearer token in idempotency JSON.
    return createHmac('sha256', Buffer.from(this.inviteSecret!, 'hex'))
      .update('alterward:shared-invite:v1:' + inviteId)
      .digest('base64url');
  }
  protected async active(tx: Database, userIds: string[]) {
    const ids = [...new Set(userIds)].sort();
    const users = await tx.query(
      'SELECT id,status FROM ff_users WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
      [ids],
    );
    if (users.length !== ids.length) fail('SHARED_INVITE_INVALID', 404);
    if (users.some((u) => u.status !== 'active')) fail('ACCOUNT_DELETING', 403);
  }
  protected async privacy(tx: Database, userId: string) {
    if (
      !(
        await tx.query(
          "SELECT id FROM ff_consents WHERE user_id=$1 AND policy_version='alpha-privacy-v1' AND consent_type='adult_and_ai_acknowledgement'",
          [userId],
        )
      ).length
    )
      fail('PRIVACY_ACKNOWLEDGEMENT_REQUIRED', 403);
  }
  protected async users(contextId: string): Promise<string[]> {
    return (
      await this.db.query(
        'SELECT user_id FROM aw_shared_members WHERE context_id=$1 AND user_id IS NOT NULL AND status=ANY($2::text[])',
        [contextId, liveStatuses],
      )
    ).map((m) => String(m.user_id));
  }
  protected async once<T>(
    userId: string,
    userIds: string[],
    scope: string,
    key: string,
    input: unknown,
    run: (tx: Database) => Promise<T>,
  ): Promise<T> {
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(key))
      fail('IDEMPOTENCY_KEY_REQUIRED', 400);
    return this.db.transaction(async (tx) => {
      await this.active(tx, [...userIds, userId]);
      await this.privacy(tx, userId);
      const old = (
        await tx.query<Row & { input_hash: string; response: T }>(
          'SELECT input_hash,response FROM ff_idempotency WHERE user_id=$1 AND scope=$2 AND key=$3',
          [userId, scope, key],
        )
      )[0];
      if (old) {
        if (old.input_hash !== hash(input)) fail('IDEMPOTENCY_CONFLICT');
        return old.response;
      }
      const result = await run(tx);
      await tx.query(
        'INSERT INTO ff_idempotency(user_id,scope,key,input_hash,response) VALUES($1,$2,$3,$4,$5)',
        [userId, scope, key, hash(input), JSON.stringify(result)],
      );
      return result;
    });
  }
  protected async context(
    tx: Database,
    contextId: string,
    lock = false,
  ): Promise<Context> {
    const row = (
      await tx.query<Context>(
        `SELECT c.*,c.simulation_at::text FROM aw_shared_contexts c WHERE id=$1 ${lock ? 'FOR UPDATE' : ''}`,
        [contextId],
      )
    )[0];
    if (!row) fail('SHARED_CONTEXT_NOT_FOUND', 404);
    return row!;
  }
  protected async member(
    tx: Database,
    userId: string,
    contextId: string,
    mutation = false,
  ): Promise<Member> {
    const row = (
      await tx.query<Member>(
        'SELECT * FROM aw_shared_members WHERE context_id=$1 AND user_id=$2 AND status=ANY($3::text[])',
        [contextId, userId, liveStatuses],
      )
    )[0];
    if (!row) fail('SHARED_CONTEXT_NOT_FOUND', 404);
    if (mutation && row!.status !== 'active')
      fail('SHARED_MEMBER_INACTIVE', 403);
    return row!;
  }
  protected revision(context: Context, expected: number) {
    if (context.revision !== expected) fail('SHARED_REVISION_CONFLICT');
  }
  protected writable(context: Context) {
    if (context.moderation_hold) fail('SHARED_MODERATION_HOLD', 403);
    if (!['inviting', 'active', 'paused'].includes(context.status))
      fail('SHARED_MEMBER_INACTIVE', 403);
    if (context.pending_event_id) fail('SHARED_PENDING_DECISION');
  }
  async tier(userId: string, tx = this.db): Promise<SharedTier> {
    const row = (
      await tx.query(
        'SELECT tier FROM aw_user_entitlements WHERE user_id=$1 AND (valid_until IS NULL OR valid_until>now())',
        [userId],
      )
    )[0];
    return sharedTierSchema.parse(row?.tier ?? 'free');
  }
  protected async entitlement(
    tx: Database,
    userId: string,
    type: SharedContextType,
    joining: boolean,
  ) {
    const tier = await this.tier(userId, tx);
    const rows = joining
      ? await tx.query(
          "SELECT count(*)::int AS count FROM aw_shared_members m JOIN aw_shared_contexts c ON c.id=m.context_id WHERE m.user_id=$1 AND m.status=ANY($2::text[]) AND c.status IN ('inviting','active','paused')",
          [userId, liveStatuses],
        )
      : [];
    requireSharedEntitlement(
      tier,
      type,
      joining ? Number(rows[0]!.count) : undefined,
    );
    if (
      joining &&
      type === 'romantic_relationship' &&
      (
        await tx.query(
          "SELECT id FROM aw_shared_members WHERE user_id=$1 AND context_type='romantic_relationship' AND context_live AND status=ANY($2::text[])",
          [userId, liveStatuses],
        )
      ).length
    )
      fail('SHARED_ROMANTIC_LIMIT');
  }
  private async branch(
    tx: Database,
    userId: string,
    branchId: string,
    expected: number,
  ) {
    const row = (
      await tx.query<Row & { life_id: string; effective_at: string }>(
        "SELECT b.life_id,b.revision,b.status,b.state->>'effectiveAt' AS effective_at,l.content_locale FROM aw_branches b JOIN aw_lives l ON l.id=b.life_id AND l.user_id=b.user_id WHERE b.id=$1 AND b.user_id=$2 FOR UPDATE OF b",
        [branchId, userId],
      )
    )[0];
    if (!row || row.content_locale !== 'en') fail('RESOURCE_NOT_FOUND', 404);
    if (row.revision !== expected) fail('LIFE_REVISION_CONFLICT');
    if (!['ready', 'decision'].includes(String(row.status)))
      fail('LIFE_GENERATION_ACTIVE');
    return row;
  }
  private async profile(
    tx: Database,
    userId: string,
    supplied?: InteractionProfile,
  ) {
    const social = (
      await tx.query(
        'SELECT display_name FROM aw_social_profiles WHERE user_id=$1',
        [userId],
      )
    )[0];
    if (!social) fail('SHARED_PROFILE_REQUIRED', 422);
    // No automatic disclosure of the personal age, location, occupation, goals or finance.
    return supplied ?? minimalInteractionProfile(String(social.display_name));
  }
  protected async blocked(tx: Database, a: string, b: string) {
    if (
      (
        await tx.query(
          'SELECT user_id FROM aw_user_blocks WHERE (user_id=$1 AND blocked_user_id=$2) OR (user_id=$2 AND blocked_user_id=$1)',
          [a, b],
        )
      ).length
    )
      fail('SHARED_BLOCKED', 403);
  }
  private async capacity(tx: Database, context: Context) {
    const [row] = await tx.query(
      'SELECT count(*)::int AS count FROM aw_shared_members WHERE context_id=$1 AND status=ANY($2::text[])',
      [context.id, liveStatuses],
    );
    if (Number(row!.count) >= SHARED_MEMBER_LIMITS[context.type])
      fail('SHARED_CONTEXT_FULL');
  }
  async socialProfile(userId: string) {
    const [p] = await this.db.query(
      'SELECT handle,display_name AS "displayName",discoverability FROM aw_social_profiles WHERE user_id=$1',
      [userId],
    );
    const tier = await this.tier(userId);
    return {
      profile: p ?? null,
      entitlement: { tier, ...SHARED_TIER_LIMITS[tier] },
    };
  }
  async saveSocialProfile(userId: string, raw: unknown) {
    const p = socialProfileSchema.parse(raw);
    try {
      await this.db.transaction(async (tx) => {
        await this.active(tx, [userId]);
        await this.privacy(tx, userId);
        await tx.query(
          'INSERT INTO aw_social_profiles(user_id,handle,display_name,discoverability) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET handle=EXCLUDED.handle,display_name=EXCLUDED.display_name,discoverability=EXCLUDED.discoverability,updated_at=now()',
          [userId, p.handle, p.displayName, p.discoverability],
        );
      });
    } catch (error) {
      if (
        (error as { code?: string; constraint?: string }).code === '23505' &&
        (error as { constraint?: string }).constraint === 'aw_social_handle'
      )
        fail('SHARED_HANDLE_UNAVAILABLE');
      throw error;
    }
    return this.socialProfile(userId);
  }
  async create(userId: string, raw: SharedCreateRequest, key: string) {
    const input = sharedCreateRequestSchema.parse(raw);
    // Type-specific consent/governance is implemented in S4–S6, never exposed early by a flag.
    if (input.type !== 'friend_group')
      fail('SHARED_CONTEXT_TYPE_NOT_ALLOWED', 403);
    return this.once(userId, [], 'shared:create', key, input, async (tx) => {
      await this.entitlement(tx, userId, input.type, true);
      const profile = await this.profile(tx, userId, input.interactionProfile);
      const b = await this.branch(tx, userId, input.branchId, input.revision);
      const contextId = randomUUID(),
        memberId = randomUUID();
      await tx.query(
        "INSERT INTO aw_shared_contexts(id,type,title,state,simulation_at,governance,content_locale) VALUES($1,$2,$3,$4,$5,$6,'en')",
        [
          contextId,
          input.type,
          input.title,
          JSON.stringify({
            type: input.type,
            summary: null,
            cohesion: null,
            currentFocus: null,
          }),
          b.effective_at,
          JSON.stringify({ type: 'individual_opt_in' }),
        ],
      );
      await tx.query(
        "INSERT INTO aw_shared_members(id,context_id,context_type,user_id,life_id,branch_id,status,admin_role,interaction_profile,sharing_policy_version) VALUES($1,$2,$3,$4,$5,$6,'active','owner',$7,'shared-profile-v1')",
        [
          memberId,
          contextId,
          input.type,
          userId,
          b.life_id,
          input.branchId,
          JSON.stringify(profile),
        ],
      );
      return { contextId, memberId, revision: 0 };
    });
  }
  async list(userId: string) {
    const rows = await this.db.query(
      'SELECT c.id,c.type,c.title,c.status,c.moderation_hold AS "moderationHold",c.content_locale,c.revision,c.simulation_at::text,m.id AS "memberId",m.status AS "membershipStatus" FROM aw_shared_contexts c JOIN aw_shared_members m ON m.context_id=c.id WHERE m.user_id=$1 AND m.status=ANY($2::text[]) ORDER BY c.updated_at DESC LIMIT 100',
      [userId, liveStatuses],
    );
    return Promise.all(
      rows.map(async (r) =>
        (await sharedContextPrivacy(this.db, String(r.id)))
          ? { ...r, title: 'Private friend group', privacyRedacted: true }
          : r,
      ),
    );
  }
  async detail(userId: string, contextId: string) {
    return this.db.transaction(async (tx) => {
      // Same aggregate lock as mutation: no read across a deletion/membership change.
      await this.active(tx, [userId]);
      const c = await this.context(tx, contextId, true);
      const own = await this.member(tx, userId, contextId);
      const members = await tx.query<Member>(
        'SELECT m.*,u.status AS account_status FROM aw_shared_members m LEFT JOIN ff_users u ON u.id=m.user_id WHERE m.context_id=$1 ORDER BY m.joined_at,m.id',
        [contextId],
      );
      const hidden = await sharedContextPrivacy(tx, contextId);
      return {
        id: c.id,
        type: c.type,
        title: hidden ? 'Private friend group' : c.title,
        status: c.status,
        locale: c.content_locale,
        revision: c.revision,
        simulationAt: c.simulation_at,
        state: hidden ? projectSharedState(c.state) : c.state,
        privacyRedacted: hidden,
        governance: c.governance,
        ownMemberId: own.id,
        pendingEventId: c.pending_event_id,
        moderationHold: c.moderation_hold,
        generation:
          (
            await tx.query(
              'SELECT id,status,stage,error_code AS "errorCode" FROM aw_shared_jobs WHERE context_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1',
              [contextId],
            )
          )[0] ?? null,
        members: members.map((m) => ({
          id: m.id,
          status: m.account_status === 'active' ? m.status : 'deleted',
          adminRole: m.account_status === 'active' ? m.admin_role : 'member',
          worldRole: m.account_status === 'active' ? m.world_role : null,
          interactionProfile:
            m.account_status === 'active'
              ? m.interaction_profile
              : minimalInteractionProfile('Former member'),
          ...(m.user_id === userId
            ? { branchId: m.branch_id, lifeId: m.life_id }
            : {}),
        })),
      };
    });
  }
  async createInvite(
    userId: string,
    contextId: string,
    raw: SharedInviteRequest,
    key: string,
  ) {
    const input = sharedInviteRequestSchema.parse(raw);
    this.token(randomUUID()); // Validate configuration before writing an unusable invite.
    await this.member(this.db, userId, contextId, true);
    const userIds = [
      ...(await this.users(contextId)),
      ...(input.targetUserId ? [input.targetUserId] : []),
    ];
    const result = await this.once(
      userId,
      userIds,
      'shared:invite:' + contextId,
      key,
      input,
      async (tx) => {
        const c = await this.context(tx, contextId, true),
          m = await this.member(tx, userId, contextId, true);
        this.revision(c, input.contextRevision);
        this.writable(c);
        if (m.admin_role !== 'owner') fail('SHARED_PERMISSION_DENIED', 403);
        await this.entitlement(tx, userId, c.type, false);
        await this.capacity(tx, c);
        if (input.targetUserId) {
          if (input.targetUserId === userId) fail('SHARED_INVITE_INVALID', 422);
          await this.blocked(tx, userId, input.targetUserId);
        }
        const [count] = await tx.query(
          "SELECT count(*)::int AS count FROM aw_shared_invites WHERE inviter_member_id=$1 AND created_at>now()-interval '24 hours'",
          [m.id],
        );
        if (Number(count!.count) >= 20) fail('SHARED_INVITE_LIMIT', 429);
        const id = randomUUID(),
          token = this.token(id);
        const [invite] = await tx.query<Row & { expires_at: string | Date }>(
          "INSERT INTO aw_shared_invites(id,context_id,inviter_member_id,target_user_id,token_hash,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '7 days') RETURNING expires_at",
          [id, c.id, m.id, input.targetUserId ?? null, tokenHash(token)],
        );
        await tx.query(
          'UPDATE aw_shared_contexts SET revision=revision+1,updated_at=now() WHERE id=$1',
          [c.id],
        );
        return {
          inviteId: id,
          contextId: c.id,
          expiresAt: new Date(invite!.expires_at).toISOString(),
          revision: c.revision + 1,
        };
      },
    );
    // The response cache contains only invite metadata; never the secret bearer token.
    return { ...result, token: this.token(result.inviteId) };
  }
  private async invitation(
    tx: Database,
    inviteId: string | null,
    token: string,
    userId: string,
    lock = false,
  ): Promise<Invite> {
    sharedInviteTokenSchema.parse(token);
    const row = (
      await tx.query<Invite>(
        `SELECT * FROM aw_shared_invites WHERE token_hash=$1 AND ($2::uuid IS NULL OR id=$2) ${lock ? 'FOR UPDATE' : ''}`,
        [tokenHash(token), inviteId],
      )
    )[0];
    if (!row || (row.target_user_id && row.target_user_id !== userId))
      fail('SHARED_INVITE_INVALID', 404);
    const digest = Buffer.from(tokenHash(token), 'hex'),
      stored = Buffer.from(row!.token_hash, 'hex');
    if (!timingSafeEqual(digest, stored)) fail('SHARED_INVITE_INVALID', 404);
    if (row!.status !== 'pending') fail('SHARED_INVITE_ALREADY_USED');
    if (new Date(row!.expires_at).getTime() <= Date.now())
      fail('SHARED_INVITE_EXPIRED', 410);
    return row!;
  }
  async previewInvite(userId: string, token: string) {
    const invite = await this.invitation(this.db, null, token, userId);
    const c = await this.context(this.db, invite.context_id);
    this.writable(c);
    const inviter = (
      await this.db.query<Member>(
        "SELECT * FROM aw_shared_members WHERE id=$1 AND status='active'",
        [invite.inviter_member_id],
      )
    )[0];
    if (!inviter?.user_id) fail('SHARED_INVITE_INVALID', 404);
    await this.blocked(this.db, userId, inviter.user_id);
    const hidden = await sharedContextPrivacy(this.db, c.id);
    return {
      inviteId: invite.id,
      contextId: c.id,
      type: c.type,
      title: hidden ? 'Private friend group' : c.title,
      contextRevision: c.revision,
      simulationAt: c.simulation_at,
      expiresAt: new Date(invite.expires_at).toISOString(),
      inviter: inviter.interaction_profile.displayName,
      canDecline: invite.target_user_id === userId,
    };
  }
  async listInvites(userId: string) {
    return this.db.query(
      "SELECT i.id,i.context_id,c.title,c.type,i.expires_at FROM aw_shared_invites i JOIN aw_shared_contexts c ON c.id=i.context_id WHERE i.target_user_id=$1 AND i.status='pending' AND i.expires_at>now() AND c.status IN ('inviting','active','paused') AND NOT EXISTS(SELECT 1 FROM aw_shared_members m JOIN aw_user_blocks b ON (b.user_id=$1 AND b.blocked_user_id=m.user_id) OR (b.blocked_user_id=$1 AND b.user_id=m.user_id) WHERE m.context_id=c.id AND m.status=ANY($2::text[])) ORDER BY i.created_at DESC LIMIT 100",
      [userId, liveStatuses],
    );
  }
  async acceptInvite(
    userId: string,
    inviteId: string,
    raw: SharedAcceptRequest,
    key: string,
  ) {
    const input = sharedAcceptRequestSchema.parse(raw);
    // Pre-read does not lock. All affected user locks precede context and invite locks.
    const [hint] = await this.db.query<Invite>(
      'SELECT * FROM aw_shared_invites WHERE id=$1 AND token_hash=$2',
      [inviteId, tokenHash(input.token)],
    );
    if (!hint || (hint.target_user_id && hint.target_user_id !== userId))
      fail('SHARED_INVITE_INVALID', 404);
    return this.once(
      userId,
      await this.users(hint.context_id),
      'shared:accept:' + inviteId,
      key,
      { ...input, token: tokenHash(input.token) },
      async (tx) => {
        const c = await this.context(tx, hint.context_id, true);
        const invite = await this.invitation(
          tx,
          inviteId,
          input.token,
          userId,
          true,
        );
        this.revision(c, input.contextRevision);
        this.writable(c);
        if (c.type !== 'friend_group')
          fail('SHARED_CONTEXT_TYPE_NOT_ALLOWED', 403);
        const members = await tx.query<Member>(
          'SELECT * FROM aw_shared_members WHERE context_id=$1 AND status=ANY($2::text[]) ORDER BY id',
          [c.id, liveStatuses],
        );
        if (members.some((m) => m.user_id === userId))
          fail('SHARED_INVITE_ALREADY_USED');
        if (
          !members.some(
            (m) => m.id === invite.inviter_member_id && m.status === 'active',
          )
        )
          fail('SHARED_INVITE_INVALID', 404);
        for (const m of members) {
          if (!m.user_id || m.status !== 'active')
            fail('SHARED_MEMBER_INACTIVE', 403);
          await this.blocked(tx, userId, m.user_id);
          await this.entitlement(tx, m.user_id, c.type, false);
        }
        await this.entitlement(tx, userId, c.type, true);
        await this.capacity(tx, c);
        const profile = await this.profile(
          tx,
          userId,
          input.interactionProfile,
        );
        const b = await this.branch(tx, userId, input.branchId, input.revision);
        // Existing participants cannot have silently advanced into a different personal future.
        const dates = await tx.query(
          "SELECT b.state->>'effectiveAt' AS effective_at,b.status FROM aw_branches b JOIN aw_shared_members m ON m.branch_id=b.id WHERE m.context_id=$1 AND m.status='active'",
          [c.id],
        );
        for (const d of dates) {
          if (!['ready', 'decision'].includes(String(d.status)))
            fail('LIFE_GENERATION_ACTIVE');
        }
        const anchor = sharedTimeAnchor(c.simulation_at, [
          b.effective_at,
          ...dates.map((d) => String(d.effective_at)),
        ]);
        const memberId = randomUUID();
        await tx.query(
          "INSERT INTO aw_shared_members(id,context_id,context_type,user_id,life_id,branch_id,status,admin_role,interaction_profile,sharing_policy_version) VALUES($1,$2,$3,$4,$5,$6,'active','member',$7,'shared-profile-v1')",
          [
            memberId,
            c.id,
            c.type,
            userId,
            b.life_id,
            input.branchId,
            JSON.stringify(profile),
          ],
        );
        await tx.query(
          "UPDATE aw_shared_invites SET status='accepted',responded_at=now() WHERE id=$1",
          [inviteId],
        );
        await tx.query(
          "UPDATE aw_shared_contexts SET status='active',simulation_at=$2,revision=revision+1,updated_at=now() WHERE id=$1",
          [c.id, anchor],
        );
        return { contextId: c.id, memberId, revision: c.revision + 1 };
      },
    );
  }
  async declineInvite(
    userId: string,
    inviteId: string,
    token: string,
    key: string,
  ) {
    const [hint] = await this.db.query<Invite>(
      'SELECT * FROM aw_shared_invites WHERE id=$1 AND token_hash=$2',
      [inviteId, tokenHash(token)],
    );
    if (!hint || (hint.target_user_id && hint.target_user_id !== userId))
      fail('SHARED_INVITE_INVALID', 404);
    // Untargeted bearer invitations are not destructively declined by arbitrary link readers.
    if (hint.target_user_id !== userId) fail('SHARED_PERMISSION_DENIED', 403);
    return this.once(
      userId,
      await this.users(hint.context_id),
      'shared:decline:' + inviteId,
      key,
      { token: tokenHash(token) },
      async (tx) => {
        await this.context(tx, hint.context_id, true);
        await this.invitation(tx, inviteId, token, userId, true);
        await tx.query(
          "UPDATE aw_shared_invites SET status='declined',responded_at=now() WHERE id=$1",
          [inviteId],
        );
        await tx.query(
          'UPDATE aw_shared_contexts SET revision=revision+1,updated_at=now() WHERE id=$1',
          [hint.context_id],
        );
        return { declined: true };
      },
    );
  }
  async lifecycle(
    userId: string,
    contextId: string,
    expected: number,
    action: 'leave' | 'end' | 'archive',
    key: string,
  ) {
    if (
      !(
        await this.db.query(
          'SELECT id FROM aw_shared_members WHERE context_id=$1 AND user_id=$2',
          [contextId, userId],
        )
      ).length
    )
      fail('SHARED_CONTEXT_NOT_FOUND', 404);
    return this.once(
      userId,
      await this.users(contextId),
      'shared:' + action + ':' + contextId,
      key,
      { contextRevision: expected },
      async (tx) => {
        const c = await this.context(tx, contextId, true),
          m = await this.member(tx, userId, contextId);
        this.revision(c, expected);
        if (action !== 'leave' && m.admin_role !== 'owner')
          fail('SHARED_PERMISSION_DENIED', 403);
        if (action === 'archive' && c.status !== 'ended')
          fail('SHARED_MEMBER_INACTIVE', 403);
        if (
          action === 'end' &&
          !['inviting', 'active', 'paused'].includes(c.status)
        )
          fail('SHARED_MEMBER_INACTIVE', 403);
        let status =
          action === 'archive'
            ? 'archived'
            : action === 'end'
              ? 'ended'
              : c.status;
        if (action === 'leave' || action === 'end')
          await cancelPendingSharedDecision(
            tx,
            c.id,
            action === 'end' ? 'context_ended' : 'participant_unavailable',
            action === 'leave' ? m.id : null,
          );
        if (action === 'leave') {
          await tx.query(
            "UPDATE aw_shared_members SET status='left',left_at=now() WHERE id=$1",
            [m.id],
          );
          await tx.query(
            "UPDATE aw_shared_impacts SET status='detached',target_branch_id=NULL WHERE member_id=$1 AND status='pending'",
            [m.id],
          );
          const [left] = await tx.query(
            'SELECT count(*)::int AS count FROM aw_shared_members WHERE context_id=$1 AND status=ANY($2::text[])',
            [c.id, liveStatuses],
          );
          if (
            ['inviting', 'active', 'paused'].includes(c.status) &&
            Number(left!.count) < 2
          )
            status = Number(left!.count) === 0 ? 'ended' : 'paused';
        }
        await tx.query(
          "UPDATE aw_shared_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL WHERE context_id=$1 AND status IN ('queued','running')",
          [c.id],
        );
        await tx.query(
          "UPDATE aw_shared_invites SET status='revoked',responded_at=now() WHERE context_id=$1 AND status='pending' AND ($2::boolean OR inviter_member_id=$3)",
          [c.id, action !== 'leave', m.id],
        );
        await tx.query(
          'UPDATE aw_shared_contexts SET status=$2,revision=revision+1,updated_at=now() WHERE id=$1',
          [c.id, status],
        );
        return { contextId: c.id, revision: c.revision + 1, status };
      },
    );
  }
  async revokeInvite(
    userId: string,
    contextId: string,
    inviteId: string,
    expected: number,
    key: string,
  ) {
    await this.member(this.db, userId, contextId, true);
    return this.once(
      userId,
      await this.users(contextId),
      'shared:revoke:' + inviteId,
      key,
      { contextId, contextRevision: expected },
      async (tx) => {
        const c = await this.context(tx, contextId, true),
          m = await this.member(tx, userId, contextId, true);
        this.revision(c, expected);
        if (m.admin_role !== 'owner') fail('SHARED_PERMISSION_DENIED', 403);
        const [i] = await tx.query<Invite>(
          'SELECT * FROM aw_shared_invites WHERE id=$1 AND context_id=$2 FOR UPDATE',
          [inviteId, c.id],
        );
        if (!i) fail('SHARED_INVITE_INVALID', 404);
        if (i.status !== 'pending') fail('SHARED_INVITE_ALREADY_USED');
        await tx.query(
          "UPDATE aw_shared_invites SET status='revoked',responded_at=now() WHERE id=$1",
          [i.id],
        );
        await tx.query(
          'UPDATE aw_shared_contexts SET revision=revision+1,updated_at=now() WHERE id=$1',
          [c.id],
        );
        return { revoked: true, revision: c.revision + 1 };
      },
    );
  }
}

export async function cancelSharedAccountJobs(tx: Database, userId: string) {
  // The private account paths remain usable before the additive Shared rollout.
  // 008/009 are applied atomically; absent storage cannot contain shared jobs.
  if (!(await sharedStoragePresent(tx))) return;
  const contexts = await tx.query(
    'SELECT c.id FROM aw_shared_contexts c WHERE EXISTS(SELECT 1 FROM aw_shared_members m WHERE m.context_id=c.id AND m.user_id=$1) ORDER BY c.id FOR UPDATE',
    [userId],
  );
  for (const c of contexts) {
    // Failed/completed job snapshots are transient AI inputs, never retained shared canon.
    // Scrub former members too, before Auth deletion/recovery can be interrupted.
    const members = await tx.query(
      'SELECT id,status FROM aw_shared_members WHERE context_id=$1 AND user_id=$2',
      [c.id, userId],
    );
    await tx.query(
      "UPDATE aw_shared_jobs SET payload='{}',checkpoints='{}',status=CASE WHEN status IN ('queued','running') THEN 'cancelled' ELSE status END,lease_token=NULL,lease_until=NULL WHERE context_id=$1 AND ($2::boolean OR requested_by_user_id=$3 OR EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(payload->'members')='array' THEN payload->'members' ELSE '[]'::jsonb END) p WHERE p->>'memberId'=ANY($4::text[])))",
      [
        c.id,
        members.some((m) => liveStatuses.includes(String(m.status))),
        userId,
        members.map((m) => String(m.id)),
      ],
    );
    for (const member of members)
      await cancelPendingSharedDecision(
        tx,
        String(c.id),
        'participant_unavailable',
        String(member.id),
        true,
      );
  }
}
export async function exportSharedAccount(tx: Database, userId: string) {
  if (!(await sharedStoragePresent(tx))) return null;
  const repo = new SharedContextRepository(tx);
  const own = await tx.query(
    'SELECT id,context_id,context_type,life_id,branch_id,status,admin_role,interaction_profile,sharing_policy_version,world_role,joined_at,left_at FROM aw_shared_members WHERE user_id=$1',
    [userId],
  );
  const contexts = await tx.query(
    'SELECT c.id,c.type,c.title,c.status,c.content_locale,c.revision,c.simulation_at::text,c.state FROM aw_shared_contexts c WHERE EXISTS(SELECT 1 FROM aw_shared_members m WHERE m.context_id=c.id AND m.user_id=$1 AND m.status=ANY($2::text[])) ORDER BY c.id',
    [userId, liveStatuses],
  );
  const invites = await tx.query(
    'SELECT i.id,i.context_id,i.status,i.expires_at,i.created_at,i.responded_at FROM aw_shared_invites i WHERE i.target_user_id=$1 OR EXISTS(SELECT 1 FROM aw_shared_members m WHERE m.id=i.inviter_member_id AND m.user_id=$1)',
    [userId],
  );
  const safeContexts = await Promise.all(
    contexts.map(async (c) =>
      (await sharedContextPrivacy(tx, String(c.id)))
        ? {
            ...c,
            title: 'Private friend group',
            state: projectSharedState(c.state as SharedState),
            privacyRedacted: true,
          }
        : c,
    ),
  );
  return {
    socialProfile: await repo.socialProfile(userId),
    memberships: own,
    contexts: safeContexts,
    invitations: invites,
    canon: await exportSharedCanon(tx, userId),
    personalMemories: await exportPersonalSharedMemories(tx, userId),
  };
}

export type { Context as SharedContextRow, Member as SharedMemberRow };

async function sharedStoragePresent(tx: Database) {
  const [row] = await tx.query(
    "SELECT to_regclass('public.aw_shared_contexts') IS NOT NULL AS present",
  );
  return row?.present === true;
}
