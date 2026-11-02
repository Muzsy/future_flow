// Synthetic, actual-image PostgreSQL companion only. No hosted database or
// provider is reachable through this fixed transport; reports are not audits.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  connectDatabase,
  Repository,
  type Database,
} from '@future-flow/database';
import { hash } from '@future-flow/core';
import { reviewedMigrationManifest } from '../lib/reviewed-migration-manifest';
import { schema040FixtureNames } from '../lib/schema040-fixture-contract.mjs';
import { preparePrivacyRestoreFixture } from '../lib/privacy-restore-proof';
import { createPrivacyFenceEnvelope } from '../lib/privacy-fence-envelope';
import { runQuarantinedReplay } from '../lib/quarantined-replay';
import {
  prepareRegistryMigrationRestore,
  applyRegistryMigrationRestore,
  verifyRegistryMigrationRestore,
} from '../lib/registry-migration-restore';
import {
  captureServiceRegistryRuntime,
  migrateServiceRegistryRuntime,
  assertServiceRegistryMigration,
} from '../lib/funded-runtime';
import {
  prepareRegistryUpgrade,
  applyRegistryUpgrade,
  reconcileRegistryUpgrade,
} from '../lib/service-registry-upgrade';
import { captureRegistry039SchemaState } from '../lib/service-registry-schema-migration';

let phase = 'precondition';

async function main() {
  assert.equal(process.platform, 'linux');
  assert.equal(process.env.ALTERWARD_SCHEMA040_FIXTURE, 'true');
  assert.equal(process.env.AI_PROJECT_BUDGET_USD, '0');
  assert.equal(process.env.AI_USER_BUDGET_USD, '0');
  assert(!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY);
  const url = new URL(process.env.DATABASE_URL ?? '');
  assert.equal(url.hostname, 'postgres');
  assert.equal(url.username, 'postgres');
  assert.equal(url.pathname, '/postgres');
  assert.equal(url.search, '');
  assert.equal(url.hash, '');
  assert(
    ['ci_unused_outside_fixture', 'rehearsal_unused'].includes(url.password),
  );
  const raw = readFileSync(0, 'utf8');
  assert(Buffer.byteLength(raw) < 4 * 1024 * 1024);
  const request = JSON.parse(raw),
    names = schema040FixtureNames(request.nonce),
    owner = 'alterward-schema040:' + request.nonce;
  assert(
    [
      'source',
      'target',
      'plan',
      'apply',
      'verify',
      'drift',
      'state039',
      'cleanup',
    ].includes(request.mode),
  );
  phase = request.mode;
  const binding = request.binding;
  assert(/^[a-f0-9]{40}$/.test(binding.sourceCommit));
  assert(/^sha256:[a-f0-9]{64}$/.test(binding.image));
  for (const required of [
    'database/migrations/040_service_access_registry.sql',
    'scripts/ops/service-registry-fixture-db.ts',
    'scripts/lib/registry-migration-restore.ts',
  ])
    assert(required in binding.sourceHashes);
  for (const [path, digest] of Object.entries(binding.sourceHashes)) {
    assert(
      /^(?:apps|packages|scripts|tests|database|deploy)\/[A-Za-z0-9_./\[\]-]+$|^(?:Dockerfile|package.json|pnpm-lock.yaml|pnpm-workspace.yaml|tsconfig.base.json|tsconfig.scripts.json|\.dockerignore|\.nvmrc)$/.test(
        path,
      ),
    );
    assert(!path.split('/').includes('..'));
    assert.equal(
      createHash('sha256')
        .update(readFileSync('/app/' + path))
        .digest('hex'),
      digest,
    );
  }
  const watchdog = setTimeout(() => process.exit(1), 180000);
  watchdog.unref();
  const admin = connectDatabase(url.href, true);
  const open = (name: string) => {
    const u = new URL(url);
    u.pathname = '/' + name;
    return connectDatabase(u.href, true);
  };
  let db: ReturnType<typeof connectDatabase> | undefined;
  async function create(name: string, template?: string) {
    assert(Object.values(names).includes(name));
    await admin.query(
      `CREATE DATABASE ${name}${template ? ' TEMPLATE ' + template : ''}`,
    );
    await admin.query(`COMMENT ON DATABASE ${name} IS '${owner}'`);
  }
  async function owned(name: string) {
    const [row] = await admin.query<{ owner: string }>(
      "SELECT shobj_description(oid,'pg_database') AS owner FROM pg_database WHERE datname=$1",
      [name],
    );
    if (row) assert.equal(row.owner, owner);
    return !!row;
  }
  async function initialize(connection: Database, receipts: boolean) {
    await connection.query(
      'CREATE TABLE ff_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
    );
    for (const step of reviewedMigrationManifest().slice(0, 39)) {
      await connection.query(step.sql);
      if (receipts)
        await connection.query(
          'INSERT INTO ff_migrations(name,checksum) VALUES($1,$2)',
          [step.name, hash(step.sql)],
        );
    }
  }
  try {
    if (request.mode === 'cleanup') {
      for (const name of [names.target, names.snapshot, names.source])
        if (await owned(name))
          await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
      for (const name of Object.values(names))
        assert.equal(await owned(name), false);
      return { cleanup: true };
    }
    if (request.mode === 'source') {
      await create(names.source);
      db = open(names.source);
      await initialize(db, true);
      const actor = randomUUID();
      await new Repository(db).ensureUser(actor);
      await db.query(
        `CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid,email text,aud text,role text,is_anonymous boolean,deleted_at timestamptz,email_confirmed_at timestamptz,last_sign_in_at timestamptz,banned_until timestamptz,email_change text)`,
      );
      await db.query(
        "INSERT INTO auth.users VALUES($1,'registry-runtime@example.invalid','authenticated','authenticated',false,NULL,now()-interval '1 day',now()-interval '1 hour',NULL,'')",
        [actor],
      );
      const facade: Database = {
        query: (sql, v) => {
          assert(db);
          return db.query(sql, v);
        },
        transaction: (run) => {
          assert(db);
          return db.transaction(run);
        },
      };
      const fixture = await preparePrivacyRestoreFixture(
        facade,
        async () => {
          assert(db);
          await db.close();
          db = undefined;
          await create(names.snapshot, names.source);
          db = open(names.source);
        },
        39,
      );
      const identity = {
        participants: [
          { email: 'registry-runtime@example.invalid', userId: actor },
        ],
        connectionHostname: 'postgres',
        databaseIdentitySha256: hash(['postgres', names.source, 'postgres']),
      };
      const before = await db!.transaction((tx) =>
        captureServiceRegistryRuntime(tx, identity),
      );
      await assert.rejects(
        db!.transaction(async (tx) => {
          await tx.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
          const query = tx.query.bind(tx);
          tx.query = async (sql, values = []) => {
            if (
              sql.startsWith('INSERT INTO public.ff_migrations') &&
              values[0] === '040_service_access_registry.sql'
            )
              throw Error('Synthetic interrupted040 receipt');
            return query(sql, values);
          };
          await migrateServiceRegistryRuntime(tx, identity, before);
        }),
        /Synthetic interrupted040 receipt/,
      );
      assert.deepEqual(
        await db!.transaction((tx) =>
          captureServiceRegistryRuntime(tx, identity),
        ),
        before,
      );
      // Bind the production database protocol to this actual source/image fixture.
      // The host controller's real backup/restore gates remain outside this synthetic proof.
      const upgradeContext = {
        sourceCommit: binding.sourceCommit,
        imageId: binding.image,
        candidateSha256: hash({ nonce: request.nonce, binding }),
        parentAuthoritySha256: hash(fixture.authority),
        backupManifestSha256: hash({
          synthetic: 'registry-runtime-backup',
          nonce: request.nonce,
        }),
        restoreProofSha256: hash({
          synthetic: 'registry-runtime-restore',
          nonce: request.nonce,
        }),
      };
      const intent = await db!.transaction(async (tx) => {
        await tx.query(
          'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
        );
        return prepareRegistryUpgrade(tx, identity, upgradeContext);
      });
      assert.deepEqual(intent.before, before);
      await assert.rejects(
        db!.transaction(async (tx) => {
          await tx.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
          return applyRegistryUpgrade(
            tx,
            identity,
            intent,
            { ...upgradeContext, candidateSha256: hash('foreign candidate') },
            hash(intent),
          );
        }),
        /binding mismatch/,
      );
      const applied = await db!.transaction(async (tx) => {
        await tx.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
        return applyRegistryUpgrade(
          tx,
          identity,
          intent,
          upgradeContext,
          hash(intent),
        );
      });
      const after = applied.observation;
      assertServiceRegistryMigration(before, after);
      const recovered = await db!.transaction(async (tx) => {
        await tx.query(
          'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
        );
        return reconcileRegistryUpgrade(
          tx,
          identity,
          intent,
          upgradeContext,
          hash(intent),
        );
      });
      assert.deepEqual(recovered, applied);
      await assert.rejects(
        db!.transaction(async (tx) => {
          await tx.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
          return applyRegistryUpgrade(
            tx,
            identity,
            intent,
            upgradeContext,
            hash(intent),
          );
        }),
        /source drift/,
      );
      return {
        source: {
          authority: fixture.authority,
          projectBinding: fixture.projectBinding,
          writerFenceDigest: fixture.writerFenceDigest,
          backupCapturedAt: fixture.backupCapturedAt,
        },
        runtime: {
          runtime039To040: true,
          billingLedgerPreserved:
            before.billingDataSha256 === after.billingDataSha256,
          migrationReceiptsPreserved:
            before.migrationPrefixSha256 === after.migrationPrefixSha256,
          interruptedMigrationRolledBack: true,
        },
        names,
      };
    }
    if (request.mode === 'target') {
      await create(names.target);
      db = open(names.target);
      await initialize(db, false);
      const f = request.source,
        context = {
          sourceCommit: binding.sourceCommit,
          imageId: binding.image,
          backupRunId: 'registry040-' + request.nonce,
          backupDumpSha256: request.dumpSha256,
          backupCapturedAt: f.backupCapturedAt,
          quarantineDatabase: names.target,
          quarantineInstanceSha256: request.instanceSha256,
        };
      const frame = {
        mode: 'recovery' as const,
        nonce: request.nonce,
        sourceCommit: binding.sourceCommit,
        sourceFilesDigest: binding.bundleSha256,
        ownerManifestDigest: hash('synthetic-schema040-owner'),
        projectBinding: f.projectBinding,
        writerFenceDigest: f.writerFenceDigest,
        expiresAt: new Date(Date.now() + 300000).toISOString(),
      };
      const envelope = createPrivacyFenceEnvelope(
        f.authority,
        hash('synthetic-schema040-auth'),
        frame,
      );
      const replay = {
        action: 'replay',
        fundedRuntime: 'v9',
        recoveryProfile: 'historical039',
        quarantineDatabase: names.target,
        backupCapturedAt: context.backupCapturedAt,
        backupDumpSha256: request.dumpSha256,
        envelope,
        held: { ...frame, stateDigest: envelope.stateDigest },
      };
      await runQuarantinedReplay(db, { ...replay, action: 'prepare' });
      return { request: replay, context };
    }
    assert(await owned(names.target));
    db = open(names.target);
    assert.equal(request.context.quarantineDatabase, names.target);
    assert.equal(request.context.sourceCommit, binding.sourceCommit);
    assert.equal(request.context.imageId, binding.image);
    if (request.mode === 'state039')
      return {
        before: await db.transaction((tx) => captureRegistry039SchemaState(tx)),
      };
    if (request.mode === 'plan')
      return await prepareRegistryMigrationRestore(
        db,
        request.request,
        request.context,
      );
    if (request.mode === 'apply') {
      assert(
        [undefined, 'before-receipt', 'lost-output'].includes(
          request.interrupt,
        ),
      );
      let selected: Database = db;
      if (request.interrupt === 'before-receipt')
        selected = {
          query: db.query.bind(db),
          transaction: (run) =>
            db!.transaction((tx) => {
              const query = tx.query.bind(tx);
              tx.query = async (sql, values = []) => {
                if (
                  sql.startsWith('INSERT INTO public.ff_migrations') &&
                  values[0] === '040_service_access_registry.sql'
                ) {
                  phase = 'before-receipt';
                  throw Error('Synthetic interrupted040 restore');
                }
                return query(sql, values);
              };
              return run(tx);
            }),
        };
      const proof = await applyRegistryMigrationRestore(
        selected,
        request.request,
        request.intent,
        request.context,
      );
      if (request.interrupt === 'lost-output') {
        phase = 'lost-output';
        throw Error('Synthetic lost output after040 commit');
      }
      assert(request.interrupt === undefined);
      return proof;
    }
    if (request.mode === 'verify')
      return await verifyRegistryMigrationRestore(
        db,
        request.request,
        request.intent,
        request.context,
      );
    if (request.mode === 'drift') {
      const reset = request.reset === true,
        changes = {
          billing: reset
            ? "UPDATE aw_billing_grants SET revoked=false WHERE key='in_kept'"
            : "UPDATE aw_billing_grants SET revoked=true WHERE key='in_kept'",
          registry: reset
            ? 'DELETE FROM aw_service_policy WHERE id=1'
            : "INSERT INTO aw_service_policy(id,version,revision,mode,generation_enabled,checkout_enabled) VALUES(1,1,1,'open',true,true)",
          receipt: reset
            ? null
            : "UPDATE ff_migrations SET checksum='tampered' WHERE name LIKE '040_%'",
        };
      assert(Object.hasOwn(changes, request.kind));
      if (request.kind === 'receipt' && reset)
        await db.query('UPDATE ff_migrations SET checksum=$1 WHERE name=$2', [
          hash(reviewedMigrationManifest()[39]!.sql),
          '040_service_access_registry.sql',
        ]);
      else await db.query(changes[request.kind as keyof typeof changes]!);
      return { driftFixtureChanged: true };
    }
    throw Error('Unreachable fixture action');
  } finally {
    await db?.close();
    await admin.close();
    clearTimeout(watchdog);
  }
}
main()
  .then((value) => console.log(JSON.stringify(value)))
  .catch(() => {
    console.error(JSON.stringify({ schema040FixtureFailure: true, phase }));
    process.exitCode = 1;
  });
