export type RetentionOperator = (
  action: Record<string, unknown>,
) => Promise<any>;

export class RetentionStopped extends Error {
  constructor(
    public readonly phase: string,
    public readonly localExpiryMayHaveCompleted: boolean,
  ) {
    super('Managed retention stopped safely');
  }
}

export async function reconcileManagedRetention(
  mode: 'check' | 'sync' | 'apply',
  local: RetentionOperator,
  remote: RetentionOperator,
) {
  let localBefore = await local({ action: 'metadata' });
  let server = await remote({ mode: 'catalog' });
  function allManifests(value: any): Record<string, object> {
    return { ...value.archivedManifests, ...value.expectedManifests };
  }
  const allServer = allManifests(server);
  for (const [run, manifest] of Object.entries(allManifests(localBefore))) {
    if (!allServer[run] || stable(manifest) !== stable(allServer[run]))
      throw Error('Independent original manifests disagree');
  }
  if (mode !== 'check') {
    // Finish an interrupted metadata compaction on either side. Only runs
    // already proved absent on both sides are eligible; ciphertext is untouched.
    const localRepair = Object.fromEntries(
      localBefore.completedRuns
        .filter((run: string) => server.archivedManifests[run])
        .map((run: string) => [run, server.archivedManifests[run]]),
    );
    if (Object.keys(localRepair).length)
      await local({
        action: 'prune',
        acknowledgedManifests: localRepair,
        serverObservedAt: server.serverClock,
      });
    const serverRepair = Object.fromEntries(
      server.completedRuns
        .filter((run: string) => localBefore.archivedManifests[run])
        .map((run: string) => [run, localBefore.archivedManifests[run]]),
    );
    if (Object.keys(serverRepair).length)
      await remote({
        mode: 'prune',
        expectedManifests: server.expectedManifests,
        acknowledgedManifests: serverRepair,
      });
    localBefore = await local({ action: 'metadata' });
    server = await remote({ mode: 'catalog' });
    // A replacement local computer can recover old metadata in small batches,
    // without ever downloading expired ciphertext or filling 100 active slots.
    const oldMissing = Object.keys(server.archivedManifests).filter(
      (run) => !allManifests(localBefore)[run],
    );
    for (let offset = 0; offset < oldMissing.length; offset += 20) {
      const batch = Object.fromEntries(
        oldMissing
          .slice(offset, offset + 20)
          .map((run) => [run, server.archivedManifests[run]]),
      );
      const batchPeer = await remote({ mode: 'catalog' });
      for (const [run, manifest] of Object.entries(batch))
        if (stable(batchPeer.archivedManifests[run]) !== stable(manifest))
          throw Error('Original archived metadata changed during bootstrap');
      await local({
        action: 'attest',
        manifests: batch,
        serverObservedAt: batchPeer.serverClock,
      });
      await local({
        action: 'prune',
        acknowledgedManifests: batch,
        serverObservedAt: batchPeer.serverClock,
      });
    }
    localBefore = await local({ action: 'metadata' });
  }
  const expected: Record<string, object> = server.expectedManifests;
  if (
    Object.keys({ ...localBefore.expectedManifests, ...expected }).length > 100
  )
    throw Error('Bounded merged active batch required');
  const missing: string[] = server.freshRuns.filter(
    (run: string) => !localBefore.completeRuns.includes(run),
  );
  let downloaded = 0;
  if (mode !== 'check') {
    for (const run of missing) {
      const bundle = await remote({
        mode: 'read',
        runId: run,
        expectedManifests: expected,
      });
      if (stable(bundle.manifest) !== stable(expected[run]))
        throw Error('Download manifest differs');
      await local({
        action: 'store',
        manifest: bundle.manifest,
        files: bundle.files,
      });
      downloaded++;
    }
  }
  const peer = await remote({ mode: 'catalog' });
  if (stable(peer.expectedManifests) !== stable(expected))
    throw Error('Server inventory changed; retry reconciliation');
  if (mode !== 'check')
    await local({
      action: 'attest',
      manifests: expected,
      serverObservedAt: peer.serverClock,
    });
  const localCheck = await local({
    action: 'check',
    serverObservedAt: peer.serverClock,
  });
  const latest = await local({ action: 'metadata' });
  let serverProof;
  let localProof = localCheck;
  let metadataCompaction;
  let finalLocal = latest;
  let finalServer = peer;
  if (mode === 'apply') {
    if (stable(latest.expectedManifests) !== stable(expected))
      throw Error('Full metadata reconciliation required');
    await remote({
      mode: 'check',
      expectedManifests: latest.expectedManifests,
    });
    let phase = 'local-apply';
    try {
      localProof = await local({
        action: 'apply',
        serverObservedAt: peer.serverClock,
      });
      phase = 'server-apply-after-local';
      serverProof = await remote({
        mode: 'apply',
        expectedManifests: latest.expectedManifests,
      });
      phase = 'post-expiry-catalog';
      const completedServer = await remote({ mode: 'catalog' });
      phase = 'post-expiry-metadata';
      const completedLocal = await local({ action: 'metadata' });
      phase = 'pre-compaction-verification';
      if (
        stable(allManifests(completedServer)) !==
        stable(allManifests(completedLocal))
      )
        throw Error('Original histories must agree before compaction');
      const acknowledged = Object.fromEntries(
        completedServer.completedRuns
          .filter((run: string) => completedLocal.completedRuns.includes(run))
          .map((run: string) => [run, completedServer.expectedManifests[run]]),
      );
      phase = 'server-compaction';
      const serverCompaction = await remote({
        mode: 'prune',
        expectedManifests: completedServer.expectedManifests,
        acknowledgedManifests: acknowledged,
      });
      phase = 'local-compaction';
      const localCompaction = await local({
        action: 'prune',
        acknowledgedManifests: acknowledged,
        serverObservedAt: serverCompaction.serverClock,
      });
      metadataCompaction = { server: serverCompaction, local: localCompaction };
      phase = 'post-compaction-catalog';
      finalServer = await remote({ mode: 'catalog' });
      phase = 'post-compaction-metadata';
      finalLocal = await local({ action: 'metadata' });
      phase = 'post-compaction-verification';
      if (
        stable(allManifests(finalLocal)) !==
          stable(allManifests(finalServer)) ||
        stable(finalLocal.expectedManifests) !==
          stable(finalServer.expectedManifests)
      )
        throw Error('Completed histories disagree');
    } catch {
      // Once apply starts, even an exception from the local helper itself can
      // follow successful unlinks. Never report that no local expiry happened.
      throw new RetentionStopped(phase, true);
    }
  }
  return {
    checkedAt: new Date().toISOString(),
    mode,
    serverKnownArchives: Object.keys(finalServer.expectedManifests).length,
    localKnownArchives: Object.keys(finalLocal.expectedManifests).length,
    serverArchivedMetadataRecords: Object.keys(finalServer.archivedManifests)
      .length,
    localArchivedMetadataRecords: Object.keys(finalLocal.archivedManifests)
      .length,
    serverAttestedMetadataOnlyArchives:
      finalLocal.serverAttestedOnlyRuns.length,
    serverFreshArchives: server.freshRuns.length,
    missingFreshLocalCopies: missing.length,
    downloadedArchives: downloaded,
    localProof,
    serverProof,
    metadataCompaction,
    metadataReconciled:
      stable(allManifests(finalLocal)) === stable(allManifests(finalServer)) &&
      stable(finalLocal.expectedManifests) ===
        stable(finalServer.expectedManifests),
    keyRead: false,
    decryptionPerformed: false,
    liveDatabaseWrites: false,
    messagesSent: 0,
    paidApplicationAiCalls: 0,
    serviceActivationAllowed: false,
    automaticRetentionConfigured: false,
    historicalCopiesExpired: false,
  };
}
function stable(value: any): string {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((key) => JSON.stringify(key) + ':' + stable(value[key]))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
