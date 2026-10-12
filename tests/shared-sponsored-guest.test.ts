import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { SharedJobRepository, type Database } from '@future-flow/database';
import { applyMigrations } from '../scripts/lib/migrations';
import {
  sharedAdapter,
  sharedParticipant,
  testInviteSecret,
} from './shared-fixtures';

let engine: PGlite;
let db: Database;
let shared: SharedJobRepository;

describe('Shared sponsored guest seats', () => {
  beforeAll(async () => {
    engine = new PGlite();
    await applyMigrations(engine);
    db = sharedAdapter(engine);
    shared = new SharedJobRepository(db, testInviteSecret);
  });

  afterAll(async () => {
    await engine?.close();
  });

  it('lets a targeted Free guest participate once while keeping host and AI rights paid', async () => {
    const owner = await sharedParticipant(db, 'explorer', 'Host');
    const guest = await sharedParticipant(db, 'free', 'Guest');
    const created = await shared.create(
      owner.id,
      {
        type: 'friend_group',
        title: 'Sponsored friends',
        branchId: owner.branchId,
        revision: owner.revision,
        sharingAcknowledged: true,
      },
      randomUUID(),
    );
    const invite = await shared.createInvite(
      owner.id,
      created.contextId,
      { contextRevision: created.revision, targetUserId: guest.id },
      randomUUID(),
    );
    const preview = await shared.previewInvite(guest.id, invite.token);
    const joined = await shared.acceptInvite(
      guest.id,
      invite.inviteId,
      {
        token: invite.token,
        branchId: guest.branchId,
        revision: guest.revision,
        contextRevision: preview.contextRevision,
        sharingAcknowledged: true,
      },
      randomUUID(),
    );

    expect(
      await db.query(
        'SELECT entitlement_mode FROM aw_shared_members WHERE id=$1',
        [joined.memberId],
      ),
    ).toEqual([{ entitlement_mode: 'sponsored_guest' }]);
    expect(
      (await shared.detail(guest.id, created.contextId)).ownEntitlementMode,
    ).toBe('sponsored_guest');
    expect((await shared.socialProfile(guest.id)).entitlement).toMatchObject({
      tier: 'free',
      activeContexts: 0,
      sponsoredGuestContexts: 1,
      sponsoredGuestTypes: ['friend_group'],
    });

    await expect(
      shared.create(
        guest.id,
        {
          type: 'friend_group',
          title: 'Guest cannot host',
          branchId: guest.branchId,
          revision: guest.revision,
          sharingAcknowledged: true,
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' });

    const detail = await shared.detail(owner.id, created.contextId);
    await expect(
      shared.enqueue(guest.id, created.contextId, detail.revision, randomUUID()),
    ).rejects.toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' });

    const queued = await shared.enqueue(
      owner.id,
      created.contextId,
      detail.revision,
      randomUUID(),
    );
    const job = await shared.claim();
    expect(job?.id).toBe(queued.jobId);
    await shared.verify(job!);
    await shared.fail(job!, new Error('Test cleanup'));

    const secondOwner = await sharedParticipant(db, 'explorer', 'Second host');
    const second = await shared.create(
      secondOwner.id,
      {
        type: 'friend_group',
        title: 'Second sponsored group',
        branchId: secondOwner.branchId,
        revision: secondOwner.revision,
        sharingAcknowledged: true,
      },
      randomUUID(),
    );
    const secondInvite = await shared.createInvite(
      secondOwner.id,
      second.contextId,
      { contextRevision: second.revision, targetUserId: guest.id },
      randomUUID(),
    );
    const secondPreview = await shared.previewInvite(guest.id, secondInvite.token);
    const secondInput = {
      token: secondInvite.token,
      branchId: guest.branchId,
      revision: guest.revision,
      contextRevision: secondPreview.contextRevision,
      sharingAcknowledged: true as const,
    };
    await expect(
      shared.acceptInvite(
        guest.id,
        secondInvite.inviteId,
        secondInput,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'SHARED_CONTEXT_LIMIT' });

    await db.query(
      "UPDATE aw_user_entitlements SET tier='explorer' WHERE user_id=$1",
      [guest.id],
    );
    const subscriberJoin = await shared.acceptInvite(
      guest.id,
      secondInvite.inviteId,
      secondInput,
      randomUUID(),
    );
    expect(
      await db.query(
        'SELECT entitlement_mode FROM aw_shared_members WHERE id=$1',
        [subscriberJoin.memberId],
      ),
    ).toEqual([{ entitlement_mode: 'subscriber' }]);

    await db.query(
      "UPDATE aw_user_entitlements SET tier='free' WHERE user_id=$1",
      [guest.id],
    );
    const secondDetail = await shared.detail(secondOwner.id, second.contextId);
    await expect(
      shared.enqueue(
        secondOwner.id,
        second.contextId,
        secondDetail.revision,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' });
  });
});
