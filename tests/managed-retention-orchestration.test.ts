import { describe, expect, it } from 'vitest';
import {
  reconcileManagedRetention,
  RetentionStopped,
} from '../scripts/lib/managed-retention.js';

const clock = '2026-10-10T16:00:00+00:00';
const manifest = {
  runId: 'known-run',
  capturedAt: '2026-10-01T16:00:00+00:00',
  source: 'fixture',
};

// Operator functions are mocked here; actual ciphertext/identity/expiry/fsync
// behavior is exercised by test_managed_reconciliation.py on both helpers.
function harness() {
  const empty = () => ({
    expectedManifests: {} as Record<string, object>,
    archivedManifests: {} as Record<string, object>,
    completedRuns: [] as string[],
    completeRuns: [] as string[],
    freshRuns: [] as string[],
    serverAttestedOnlyRuns: [] as string[],
    serverClock: clock,
  });
  const client = empty(),
    server = empty();
  const calls: string[] = [];
  let failServerApply = false,
    changeCatalogAt = 0,
    catalogs = 0;
  const operator =
    (side: 'local' | 'server') => async (request: Record<string, any>) => {
      const state = side === 'local' ? client : server;
      const action = request.action ?? request.mode;
      calls.push(`${side}:${action}`);
      if (action === 'catalog' || action === 'metadata') {
        if (side === 'server' && ++catalogs === changeCatalogAt)
          state.expectedManifests = {
            'known-run': { ...manifest, source: 'changed' },
          };
        return structuredClone(state);
      }
      if (action === 'check')
        return {
          removedFiles: 0,
          completeFreshArchives: state.completeRuns.length,
        };
      if (action === 'read')
        return {
          manifest: state.expectedManifests[request.runId],
          files: { fixture: 'synthetic-ciphertext' },
        };
      if (action === 'store') {
        state.expectedManifests[request.manifest.runId] = request.manifest;
        state.completeRuns.push(request.manifest.runId);
        return { stored: true };
      }
      if (action === 'attest') {
        for (const [run, value] of Object.entries(request.manifests)) {
          if (!state.archivedManifests[run])
            state.expectedManifests[run] = value as object;
          if (
            !server.freshRuns.includes(run) &&
            !state.completedRuns.includes(run)
          )
            state.completedRuns.push(run);
        }
        return structuredClone(state);
      }
      if (action === 'apply') {
        if (side === 'server' && failServerApply)
          throw Error('Synthetic held remote lock');
        state.completedRuns = Object.keys(state.expectedManifests).filter(
          (run) => !server.freshRuns.includes(run),
        );
        return { removedFiles: state.completedRuns.length, serverClock: clock };
      }
      if (action === 'prune') {
        for (const [run, value] of Object.entries(
          request.acknowledgedManifests,
        )) {
          state.archivedManifests[run] = value as object;
          delete state.expectedManifests[run];
          state.completedRuns = state.completedRuns.filter(
            (value) => value !== run,
          );
        }
        return { ciphertextsDeleted: 0, serverClock: clock };
      }
      throw Error('Unexpected synthetic operator action');
    };
  return {
    client,
    server,
    calls,
    local: operator('local'),
    remote: operator('server'),
    fail: () => {
      failServerApply = true;
    },
    recover: () => {
      failServerApply = false;
    },
    change: (at: number) => {
      changeCatalogAt = at;
    },
  };
}

describe('managed retention orchestration', () => {
  it('check reports a missing fresh local copy without any mutation', async () => {
    const h = harness();
    h.server.expectedManifests = { 'known-run': manifest };
    h.server.freshRuns = ['known-run'];
    const proof = await reconcileManagedRetention('check', h.local, h.remote);
    expect(proof.missingFreshLocalCopies).toBe(1);
    expect(proof.metadataReconciled).toBe(false);
    expect(
      h.calls.every((value) => /:(metadata|catalog|check)$/.test(value)),
    ).toBe(true);
  });
  it('sync recovers a server-only fresh copy without expiring ciphertext', async () => {
    const h = harness();
    h.server.expectedManifests = { 'known-run': manifest };
    h.server.freshRuns = ['known-run'];
    const proof = await reconcileManagedRetention('sync', h.local, h.remote);
    expect(proof.downloadedArchives).toBe(1);
    expect(proof.metadataReconciled).toBe(true);
    expect(h.calls).toContain('server:read');
    expect(h.calls).not.toContain('local:apply');
    expect(h.calls).not.toContain('server:apply');
  });
  it('conflicting original manifests stop before download or expiry', async () => {
    const h = harness();
    h.client.expectedManifests = { 'known-run': manifest };
    h.server.expectedManifests = {
      'known-run': { ...manifest, source: 'other' },
    };
    await expect(
      reconcileManagedRetention('apply', h.local, h.remote),
    ).rejects.toThrow('manifests disagree');
    expect(h.calls).toEqual(['local:metadata', 'server:catalog']);
  });
  it('a changed second catalog prevents both local and server expiry', async () => {
    const h = harness();
    h.client.expectedManifests = { 'known-run': manifest };
    h.server.expectedManifests = { 'known-run': manifest };
    h.change(3);
    await expect(
      reconcileManagedRetention('apply', h.local, h.remote),
    ).rejects.toThrow('Server inventory changed');
    expect(h.calls).not.toContain('local:apply');
    expect(h.calls).not.toContain('server:apply');
  });
  it('flags a remote failure after local expiry and safely completes on retry', async () => {
    const h = harness();
    h.client.expectedManifests = { 'known-run': manifest };
    h.server.expectedManifests = { 'known-run': manifest };
    h.fail();
    try {
      await reconcileManagedRetention('apply', h.local, h.remote);
      expect.fail('Expected controlled remote failure');
    } catch (error) {
      expect(error).toBeInstanceOf(RetentionStopped);
      expect(error).toMatchObject({
        phase: 'server-apply-after-local',
        localExpiryMayHaveCompleted: true,
      });
    }
    expect(h.calls).not.toContain('server:prune');
    h.recover();
    const proof = await reconcileManagedRetention('apply', h.local, h.remote);
    expect(proof.metadataReconciled).toBe(true);
    expect(proof.serverKnownArchives).toBe(0);
    expect(proof.localKnownArchives).toBe(0);
    expect(proof.serverArchivedMetadataRecords).toBe(1);
    expect(proof.localArchivedMetadataRecords).toBe(1);
  });
  it('repairs either half of interrupted metadata compaction without expiry', async () => {
    for (const archived of ['local', 'server']) {
      const h = harness();
      const complete = archived === 'local' ? h.server : h.client;
      const history = archived === 'local' ? h.client : h.server;
      complete.expectedManifests = { 'known-run': manifest };
      complete.completedRuns = ['known-run'];
      history.archivedManifests = { 'known-run': manifest };
      const proof = await reconcileManagedRetention('sync', h.local, h.remote);
      expect(proof.metadataReconciled).toBe(true);
      expect(h.calls).not.toContain('local:apply');
      expect(h.calls).not.toContain('server:apply');
      expect(h.client.archivedManifests).toEqual(h.server.archivedManifests);
    }
  });
  it('reconstructs expired history on a replacement client without downloading ciphertext', async () => {
    const h = harness();
    h.server.archivedManifests = { 'known-run': manifest };
    const proof = await reconcileManagedRetention('sync', h.local, h.remote);
    expect(proof.metadataReconciled).toBe(true);
    expect(h.client.expectedManifests).toEqual({});
    expect(h.client.archivedManifests).toEqual(h.server.archivedManifests);
    expect(h.calls).not.toContain('server:read');
    expect(h.calls).not.toContain('local:store');
  });
  it('flags a partial local apply failure and errors after either expiry', async () => {
    for (const failAt of [
      'local:apply',
      'server:catalog-after-apply',
      'local:prune',
    ]) {
      const h = harness();
      h.client.expectedManifests = { 'known-run': manifest };
      h.server.expectedManifests = { 'known-run': manifest };
      let applied = false;
      const local = async (request: Record<string, any>) => {
        if (failAt === 'local:apply' && request.action === 'apply') {
          await h.local(request); // Models a successful unlink followed by failure.
          throw Error('Synthetic partial local expiry');
        }
        if (failAt === 'local:prune' && request.action === 'prune')
          throw Error('Synthetic local metadata write failure');
        return h.local(request);
      };
      const remote = async (request: Record<string, any>) => {
        if (
          request.mode === 'catalog' &&
          applied &&
          failAt === 'server:catalog-after-apply'
        )
          throw Error('Synthetic post-expiry catalog failure');
        const value = await h.remote(request);
        if (request.mode === 'apply') applied = true;
        return value;
      };
      await expect(
        reconcileManagedRetention('apply', local, remote),
      ).rejects.toMatchObject({
        localExpiryMayHaveCompleted: true,
        phase:
          failAt === 'local:apply'
            ? 'local-apply'
            : failAt === 'local:prune'
              ? 'local-compaction'
              : 'post-expiry-catalog',
      });
    }
  });
  it('flags a post-compaction mismatch as a possible completed local expiry', async () => {
    const h = harness();
    h.client.expectedManifests = { 'known-run': manifest };
    h.server.expectedManifests = { 'known-run': manifest };
    let pruned = false;
    const local = async (request: Record<string, any>) => {
      const result = await h.local(request);
      if (request.action === 'prune') pruned = true;
      if (request.action === 'metadata' && pruned)
        result.archivedManifests['known-run'] = {
          ...manifest,
          source: 'changed',
        };
      return result;
    };
    await expect(
      reconcileManagedRetention('apply', local, h.remote),
    ).rejects.toMatchObject({
      phase: 'post-compaction-verification',
      localExpiryMayHaveCompleted: true,
    });
  });
  it('bootstraps more than one batch using a fresh peer clock for each batch', async () => {
    const h = harness();
    h.server.archivedManifests = Object.fromEntries(
      Array.from({ length: 23 }, (_, i) => [
        `old-${i}`,
        { ...manifest, runId: `old-${i}` },
      ]),
    );
    let catalog = 0;
    const requests: Record<string, any>[] = [];
    const remote = async (request: Record<string, any>) => {
      const result = await h.remote(request);
      if (request.mode === 'catalog')
        result.serverClock = `2026-10-10T16:0${++catalog}:00+00:00`;
      return result;
    };
    const local = async (request: Record<string, any>) => {
      requests.push(request);
      return h.local(request);
    };
    const proof = await reconcileManagedRetention('sync', local, remote);
    const batches = requests.filter(
      (r) => r.action === 'attest' && Object.keys(r.manifests).length,
    );
    expect(batches.map((r) => Object.keys(r.manifests).length)).toEqual([
      20, 3,
    ]);
    expect(batches[0].serverObservedAt).not.toBe(batches[1].serverObservedAt);
    expect(
      requests
        .filter((r) => r.action === 'prune')
        .map((r) => r.serverObservedAt),
    ).toEqual(batches.map((r) => r.serverObservedAt));
    expect(proof.metadataReconciled).toBe(true);
    expect(h.calls).not.toContain('server:read');
  });
});
