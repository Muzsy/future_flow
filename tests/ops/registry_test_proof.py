"""Synthetic metadata for validator tests; never an image acceptance receipt."""
import datetime as dt
from test_contabo_daily import daily


def registry_replay(candidate, manifest=None, *, migration=True):
    run_id = '20261102T100000Z-12345678'
    manifest = manifest or {'runId':run_id, 'ownerCommit':'d'*40,'ownerImage':'sha256:'+'e'*64,
        'dumpSha256':'f'*64, 'capturedAt':candidate['preparedAt'],
        'encryptedFiles':{'application.dump.age':{'sha256':'a'*64,'bytes':100}}}
    at = dt.datetime.fromisoformat(candidate['preparedAt'].replace('Z','+00:00'))+dt.timedelta(seconds=1)
    proof = {'sourceCommit':candidate['sourceCommit'],'mode':'rehearsal',
        'ownerManifestDigest':candidate['files']['previous']['manifest.json'],
        'backupRunId':manifest['runId'],'backupManifestSha256':daily.digest(daily.successor_json(manifest)),
        'backupManifestCanonicalSha256':daily.successor_canonical_hash(manifest),
        'backupCipherSha256':manifest['encryptedFiles']['application.dump.age']['sha256'],
        'tablesMatchedBeforeReplay':101 if migration else 103,'servicesStoppedAndResumed':3,'publicPorts':0,
        'paidAiCalls':0,'capturedAt':at.isoformat().replace('+00:00','Z'),
        **{k:True for k in ('originalIdsImagesPreserved','foreignContainersUnchanged','freshStateEqualBeforeAndAfterReplay',
            'ownerOriginBoundaryVerified','dataOnlyOriginalBackupLoaded','cleanCatalogHardenedBeforeDataLoad',
            'networkHasNoExternalInterface','temporaryContainersAndPlaintextRemoved')},
        **{k:False for k in ('writerFenceStillHeld','replayAllowed','serviceActivationAllowed','liveDatabaseWrites',
            'authProviderWrites','externalMessagesSent')},
        'fundedRuntime':{'version':'alterward-funded-replay-1' if migration else 'alterward-funded-replay-2',
            'sourceCommit':manifest['ownerCommit'],'imageId':manifest['ownerImage'],
            'ownerManifestDigest':candidate['files']['previous']['manifest.json']}}
    if migration:
        proof['registryCandidate'] = {'preparedSha256':daily.digest(daily.successor_json(candidate)),
            'targetImage':candidate['release']['target']['imageId']}
        proof['registryMigrationRestore'] = {'version':'alterward-registry-migration-restore-proof-1',
            'profile':'historical039-to-registry040','context':{'sourceCommit':candidate['sourceCommit'],
                'imageId':candidate['release']['target']['imageId'],'backupRunId':manifest['runId'],
                'backupDumpSha256':manifest['dumpSha256'],'backupCapturedAt':manifest['capturedAt'].replace('+00:00','Z'),
                'quarantineDatabase':'aw_restore_'+'a'*24,'quarantineInstanceSha256':'b'*64},
            'sourceTables':100,'reviewedTables':102,'reviewedForeignKeys':226,'newRegistryEmpty':True,
            'replayedDataPreserved':True,'serviceActivationAllowed':False,'authProviderWrites':False,'providerApiCalls':0,
            **{k:'c'*64 for k in ('intentSha256','sourceAuthoritySha256','historicalReplayProofSha256',
                'historicalVerificationSha256','postVerificationSha256')}}
    else:
        proof['fundedRuntime'].update(schema=40,recoveryProfile='registry040')
        proof.update(reviewedTables=102,reviewedForeignKeys=226,independentReadOnlyPostReplayVerified=True,
                     reviewedSecurityCatalog=True)
    return manifest, proof
