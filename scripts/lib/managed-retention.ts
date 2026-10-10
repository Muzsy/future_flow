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
      await local({ action: 'attest', manifests: batch });
      await local({
        action: 'prune',
        acknowledgedManifests: batch,
        serverObservedAt: server.serverClock,
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
    await local({ action: 'attest', manifests: expected });
  }
  const peer = await remote({ mode: 'catalog' });
  if (stable(peer.expectedManifests) !== stable(expected))
    throw Error('Server inventory changed; retry reconciliation');
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
    localProof = await local({
      action: 'apply',
      serverObservedAt: peer.serverClock,
    });
    try {
      serverProof = await remote({
        mode: 'apply',
        expectedManifests: latest.expectedManifests,
      });
    } catch {
      throw new RetentionStopped('server-apply-after-local', true);
    }
    const completedServer = await remote({ mode: 'catalog' });
    const completedLocal = await local({ action: 'metadata' });
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
    const serverCompaction = await remote({
      mode: 'prune',
      expectedManifests: completedServer.expectedManifests,
      acknowledgedManifests: acknowledged,
    });
    const localCompaction = await local({
      action: 'prune',
      acknowledgedManifests: acknowledged,
      serverObservedAt: serverCompaction.serverClock,
    });
    metadataCompaction = { server: serverCompaction, local: localCompaction };
    finalServer = await remote({ mode: 'catalog' });
    finalLocal = await local({ action: 'metadata' });
    if (
      stable(allManifests(finalLocal)) !== stable(allManifests(finalServer)) ||
      stable(finalLocal.expectedManifests) !==
        stable(finalServer.expectedManifests)
    )
      throw new RetentionStopped('post-compaction-verification', true);
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
