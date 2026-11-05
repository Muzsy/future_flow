"""`--active-proof` binds to the CURRENTLY active generation, never to the original funded one.

Real private files and the real Daily validators over a chain
funded -> owner-e2e -> reader-admission -> tester-beta -> schema-039 -> schema-040
(the production shape: four exposed successor generations, a fifth being the 040
preparation). Only the Docker boundary (image inspect and the in-image capability
probe) is substituted. Adapter regression tests, NOT the Linux/root acceptance.
"""
import json
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import test_beta_successor_chain as chained
import test_beta_successor_chain_root as base
from test_funded_replay import replay
from test_service_registry_protocol import observed

funded, daily = base.funded, base.daily
sys.modules['alterward_funded_replay'] = replay  # the module the production import resolves

IMAGE = 'sha256:' + 'b' * 64
OPERATOR = 'e' * 40  # the checkout the operator runs, newer than every generation
OPERATOR_BUNDLE = 'f' * 64


def capability(registry=False):
    value = {'version': 'alterward-funded-runtime-1', 'schema': 39,
             'policies': ['policy-%d' % n for n in range(18)] + ['fiction-v9'],
             'characterStateVersion': '1.0.0', 'fictionArtifactVersion': '2.0.0',
             'fictionV9Policy': {'qualityPolicyVersion': '2.8.0'},
             'reviewedPolicy': {'maxPhysicalRequests': 8}}
    if registry:
        value.update(version='alterward-funded-runtime-2', schema=40, profile='service-registry-040', fromSchema=39)
    return value


def recorded(registry=False):
    return funded.sha(funded.encoded(capability(registry)))


class RecordingChain(chained.Chain):
    """The shared chain fixture, with the image fields a real prepared candidate carries."""

    def runtime(self, root, terms, emails, **kwargs):
        files, release = super().runtime(root, terms, emails, **kwargs)
        registry = root.name == daily.SUCCESSOR_ROOT_NAMES[4]
        for role in ('target', 'recovery'):
            release[role] = {**release[role], 'imageTag': 'alterward:contabo-' + 'b' * 12,
                             'sourceDirectory': '/root/alterward-ops/build/' + 'b' * 40}
            release[role + 'CapabilitySha256'] = recorded(registry)
        return files, release


class ActiveProofBase(base.ChainRootBase):
    def setUp(self):
        with patch.object(chained, 'Chain', RecordingChain):
            super().setUp()
        self.owner = self.fixture.owner
        p = patch.object(funded.upgrade, 'docker', side_effect=self.docker)
        p.start()
        self.addCleanup(p.stop)
        self.image_id, self.probe = IMAGE, capability()

    def docker(self, *args, **kwargs):
        assert args[:2] == ('image', 'inspect'), args
        return SimpleNamespace(stdout=json.dumps([{'Id': self.image_id, 'Config': {
            'User': 'node', 'WorkingDir': '/app', 'Entrypoint': ['docker-entrypoint.sh']}}]).encode())

    def production_shape(self):
        """Four exposed successor generations: owner window, readers, testers, schema 039."""
        self.chain.admit_readers()
        value = self.chain.prepare(3, 'tester-beta', participants=self.chain.testers())
        self.chain.expose(3, value, window_changed=True)
        value = self.chain.prepare(4, 'schema-039')
        self.chain.expose(4, value, window_changed=False, schema=True)
        return value

    def request(self, **changes):
        return {'mode': 'active-proof', 'sourceCommit': OPERATOR, 'bundleSha256': OPERATOR_BUNDLE,
                'sourceHashes': {'apps/api/src/main.ts': 'a' * 64}, **changes}

    def active(self, probe=None, **changes):
        system = funded.System(self.request(**changes), daily)
        system.archive_support = Mock()
        system.capability = Mock(side_effect=lambda *args, **kwargs: SimpleNamespace(
            stdout=json.dumps(self.probe if probe is None else probe).encode()))
        system.image = Mock(wraps=system.image)
        return system

    def proof(self, **kwargs):
        return self.active(**kwargs).active_proof()


class ActiveGenerationProofTests(ActiveProofBase):
    def setUp(self):
        super().setUp()
        self.fourth = self.production_shape()

    def test_four_exposed_successors_and_a_pending_040_issue_the_proof_of_generation_four(self):
        self.chain.prepare(5, 'schema-040', database=observed())  # the K-A state after `--prepare`
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))
        system = self.active()
        proof = system.active_proof()
        self.assertEqual(proof['version'], 'alterward-funded-replay-1')
        self.assertEqual((proof['sourceCommit'], proof['imageId'], proof['role']), ('b' * 40, IMAGE, 'target'))
        # The proof is the exact generation-four candidate, not the original funded one and not the pending 040.
        fourth = daily.digest((self.chain.root(4) / 'prepared.json').read_bytes())
        self.assertEqual(proof['preparedSha256'], fourth)
        self.assertNotEqual(proof['preparedSha256'], daily.digest((self.chain.fixture.parent / 'prepared.json').read_bytes()))
        self.assertNotEqual(proof['preparedSha256'], daily.digest((self.chain.root(5) / 'prepared.json').read_bytes()))
        self.assertEqual(proof['sourceCommit'], self.fourth['sourceCommit'])
        # Exactly the downstream consumers' own derivation (fence plan, restore proof, rehearsal).
        self.assertEqual(replay.require_funded_runtime(daily, base.funded.fence.original, proof), proof)
        # The operator checkout is not the generation's source: only the recorded evidence is compared.
        system.image.assert_not_called()
        system.capability.assert_called_once_with(IMAGE, {}, registry=False)

    def test_the_recorded_capability_is_the_only_accepted_one(self):
        for label, probe in [('other policy', {**capability(), 'policies': capability()['policies'][:-1] + ['fiction-v8']}),
                             ('other version', {**capability(), 'version': 'alterward-funded-runtime-9'}),
                             ('extra field', {**capability(), 'extra': True})]:
            with self.subTest(label), self.assertRaises(ValueError):
                self.proof(probe=probe)
        # Compatible with the profile but not the recorded bytes of this generation.
        compatible = {**capability(), 'context': {'planner': 'life_narrative_plan.v9'}}
        with self.assertRaisesRegex(ValueError, 'recorded evidence'):
            self.proof(probe=compatible)
        # The registry profile is never implied by the checkout or the request: generation four is pre-040.
        with self.assertRaises(ValueError):
            self.proof(probe=capability(registry=True))

    def test_a_missing_or_malformed_recorded_digest_never_falls_back_to_trust(self):
        path = self.chain.root(4) / 'prepared.json'
        value = json.loads(path.read_bytes())
        for label, mutate in [('missing', lambda r: r.pop('targetCapabilitySha256')),
                              ('short', lambda r: r.update(targetCapabilitySha256='abc')),
                              ('not a string', lambda r: r.update(targetCapabilitySha256=7))]:
            with self.subTest(label):
                changed = json.loads(json.dumps(value))
                mutate(changed['release'])
                self.fixture.write(path, chained.encoded(changed))
                # Tampered evidence is already refused by the journal/readback binding.
                with self.assertRaises(ValueError):
                    self.proof()
        self.fixture.write(path, chained.encoded(value))
        self.assertEqual(self.proof()['sourceCommit'], 'b' * 40)

    def test_the_cached_image_must_be_the_recorded_immutable_image(self):
        for label, change in [('other image id', {'Id': 'sha256:' + 'c' * 64}),
                              ('root user', {'Config': {'User': 'root', 'WorkingDir': '/app', 'Entrypoint': ['docker-entrypoint.sh']}}),
                              ('other entrypoint', {'Config': {'User': 'node', 'WorkingDir': '/app', 'Entrypoint': ['sh']}})]:
            with self.subTest(label):
                value = {'Id': IMAGE, 'Config': {'User': 'node', 'WorkingDir': '/app', 'Entrypoint': ['docker-entrypoint.sh']}, **change}
                with patch.object(funded.upgrade, 'docker', return_value=SimpleNamespace(stdout=json.dumps([value]).encode())):
                    with self.assertRaises(ValueError):
                        self.proof()

    def test_tampered_active_runtime_bytes_never_issue_a_proof(self):
        for name in daily.RUNTIME_NAMES:
            with self.subTest(name=name):
                path = self.owner / name
                original = path.read_bytes()
                self.fixture.write(path, original + b'x')
                system = self.active()
                with self.assertRaises(ValueError):
                    system.active_proof()
                system.capability.assert_not_called()
                self.fixture.write(path, original)
        self.assertEqual(self.proof()['sourceCommit'], 'b' * 40)

    def test_retained_generation_files_cannot_be_replaced(self):
        for role in ('target', 'recovery'):
            path = self.chain.root(4) / role / 'server.env'
            original = path.read_bytes()
            self.fixture.write(path, original + b'x')
            with self.subTest(role=role), self.assertRaises(ValueError):
                self.proof()
            self.fixture.write(path, original)

    def test_rolling_the_runtime_back_to_an_earlier_generation_is_a_wrong_generation(self):
        for name in daily.RUNTIME_NAMES:
            self.fixture.write(self.owner / name, (self.chain.root(3) / 'target' / name).read_bytes())
        system = self.active()
        with self.assertRaises(ValueError):
            system.active_proof()
        system.capability.assert_not_called()

    def test_the_original_funded_runtime_is_not_the_active_generation_either(self):
        for name in daily.RUNTIME_NAMES:
            self.fixture.write(self.owner / name, (self.chain.fixture.parent / 'target' / name).read_bytes())
        with self.assertRaises(ValueError):
            self.proof()

    def test_a_running_container_of_another_image_or_an_extra_one_off_is_refused(self):
        real = daily.owner_runtime
        manifest, services = real()
        other = {**services, 'worker': {**services['worker'], 'Image': 'sha256:' + 'c' * 64}}
        with patch.object(daily, 'owner_runtime', return_value=(manifest, other)):
            with self.assertRaises(ValueError):
                self.proof()
        extra = list(daily.containers()) + [{**services['worker'], 'Id': 'extra'}]
        with patch.object(daily, 'containers', return_value=extra):
            with self.assertRaises(ValueError):
                self.proof()

    def test_a_broken_parent_chain_back_to_the_original_never_issues_a_proof(self):
        targets = [self.chain.fixture.parent / 'readback.json',   # the original funded proof
                   self.chain.root(1) / 'readback.json',          # an intermediate generation
                   self.chain.root(2) / 'journal.json',
                   self.chain.root(3) / 'prepared.json']
        for path in targets:
            with self.subTest(path=path.parent.name + '/' + path.name):
                original = path.read_bytes()
                self.fixture.write(path, original.replace(b'"', b"'", 1) if path.name != 'readback.json'
                                   else original.replace(b'"protectedDataUnchanged":true', b'"protectedDataUnchanged":false'))
                system = self.active()
                with self.assertRaises(ValueError):
                    system.active_proof()
                system.capability.assert_not_called()
                self.fixture.write(path, original)
        self.assertEqual(self.proof()['sourceCommit'], 'b' * 40)

    def test_parent_hashes_recorded_in_the_active_generation_must_match_its_parent(self):
        path = self.chain.root(4) / 'prepared.json'
        original = path.read_bytes()
        value = json.loads(original)
        value['parentPreparedSha256'] = '0' * 64
        self.fixture.write(path, chained.encoded(value))
        with self.assertRaises(ValueError):
            self.proof()
        self.fixture.write(path, original)
        self.assertTrue(self.proof())

    def test_an_unfinished_or_expired_fifth_generation_never_becomes_the_proof_source(self):
        candidate = self.chain.prepare(5, 'schema-040', database=observed())
        self.chain.journal(5, ['apply-intent', 'held'])  # interrupted transition: serving stays closed
        self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))
        with self.assertRaises(ValueError):
            self.proof()
        self.assertTrue(candidate)

    def test_runtime_drift_while_the_image_is_checked_is_refused(self):
        system = self.active()
        def drift(*args, **kwargs):
            path = self.owner / 'server.env'
            self.fixture.write(path, path.read_bytes() + b'drift')
            return SimpleNamespace(stdout=json.dumps(self.probe).encode())
        system.capability = Mock(side_effect=drift)
        with self.assertRaises(ValueError):
            system.active_proof()
        system.capability.assert_called_once()  # refused by the re-read AFTER the image check

    def test_the_generations_own_exact_source_runs_the_complete_source_and_capability_check(self):
        system = self.active(sourceCommit='b' * 40, bundleSha256='c' * 64)
        system.image = Mock(return_value=recorded())
        proof = system.active_proof()
        system.image.assert_called_once()
        self.assertEqual(system.image.call_args.args[0]['imageId'], IMAGE)
        system.capability.assert_not_called()
        self.assertEqual(proof['sourceCommit'], 'b' * 40)

    def test_another_commit_with_the_generations_commit_but_a_foreign_bundle_is_not_exact(self):
        system = self.active(sourceCommit='b' * 40, bundleSha256='9' * 64)
        system.image = Mock()
        system.active_proof()
        system.image.assert_not_called()  # recorded-evidence path, never the source comparison
        system.capability.assert_called_once()


class ActiveRegistryProofTests(ActiveProofBase):
    def setUp(self):
        super().setUp()
        self.production_shape()
        value = self.chain.prepare(5, 'schema-040', database=observed())
        self.chain.expose(5, value, window_changed=False)
        self.probe = capability(registry=True)

    def test_the_native_040_generation_issues_the_registry_proof_with_the_registry_profile(self):
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))
        system = self.active()
        proof = system.active_proof()
        self.assertEqual((proof['version'], proof['schema'], proof['recoveryProfile']),
                         ('alterward-funded-replay-2', 40, 'registry040'))
        self.assertEqual(proof['preparedSha256'], daily.digest((self.chain.root(5) / 'prepared.json').read_bytes()))
        self.assertEqual(replay.require_funded_runtime(daily, base.funded.fence.original, proof), proof)
        system.capability.assert_called_once_with(IMAGE, {}, registry=True)

    def test_the_registry_profile_comes_from_the_active_evidence_only(self):
        with self.assertRaises(ValueError):
            self.proof(probe=capability())  # a 039 capability for a 040 generation
        with self.assertRaises(ValueError):
            self.proof(probe={**capability(registry=True), 'fromSchema': 38})
        with self.assertRaisesRegex(ValueError, 'recorded evidence'):
            self.proof(probe={**capability(registry=True), 'context': {'planner': 'other'}})

    def test_the_exact_source_of_the_040_generation_uses_the_registry_command_for_the_full_check(self):
        system = self.active(sourceCommit='b' * 40, bundleSha256='c' * 64)
        system.image = Mock(return_value=recorded(True))
        self.assertEqual(system.active_proof()['version'], 'alterward-funded-replay-2')
        self.assertEqual(system.image_capability_profile(), ('alterward-funded-runtime-2', 40, 'service-registry-040'))
        self.assertEqual(system.allowed_capability_commands(), (funded.CAPABILITY_COMMAND, funded.REGISTRY_CAPABILITY_COMMAND))


class OriginalGenerationOnlyTests(unittest.TestCase):
    """Without any successor the original exact committed source is still required."""

    def setUp(self):
        import test_beta_successor_authority as authority
        self.fixture = authority.SuccessorAuthorityTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        for module in (funded,):
            p = patch.object(module, 'DIRECTORY', self.fixture.owner)
            p.start()
            self.addCleanup(p.stop)
        p = patch.object(funded.fence, 'original', side_effect=authority.test_read)
        p.start()
        self.addCleanup(p.stop)

    def system(self, **changes):
        request = {'mode': 'active-proof', 'sourceCommit': OPERATOR, 'bundleSha256': OPERATOR_BUNDLE,
                   'sourceHashes': {}, **changes}
        system = funded.System(request, daily)
        system.image = Mock()
        return system

    def test_another_checkout_cannot_prove_the_original_generation(self):
        system = self.system()
        with self.assertRaisesRegex(ValueError, 'original exact committed upgrade source'):
            system.active_proof()
        system.image.assert_not_called()

    def test_only_the_exact_original_source_and_bundle_runs_the_unchanged_image_check(self):
        old = self.fixture.old
        for changes in ({'sourceCommit': old['sourceCommit'], 'bundleSha256': OPERATOR_BUNDLE},
                        {'sourceCommit': OPERATOR, 'bundleSha256': old['bundleSha256']}):
            with self.subTest(changes=changes):
                system = self.system(**changes)
                with self.assertRaisesRegex(ValueError, 'original exact committed upgrade source'):
                    system.active_proof()
        system = self.system(sourceCommit=old['sourceCommit'], bundleSha256=old['bundleSha256'])
        proof = system.active_proof()
        system.image.assert_called_once_with(old['release']['target'])
        self.assertEqual(proof['version'], 'alterward-funded-replay-1')


class CapabilityInputScopeTests(unittest.TestCase):
    """The input-free probe exists only for the active proof and for cleaning its helper."""

    def system(self, mode):
        system = object.__new__(funded.System)
        system.request = {'mode': mode, 'sourceCommit': 'a' * 40, 'bundleSha256': 'b' * 64,
                          'sourceHashes': {'apps/a.ts': 'c' * 64}}
        return system

    def test_the_empty_input_is_accepted_only_in_the_two_active_proof_modes(self):
        empty = funded.sha(funded.encoded({}))
        full = funded.sha(funded.encoded({'apps/a.ts': 'c' * 64}))
        for mode in ('active-proof', 'cleanup-probe'):
            self.assertEqual(self.system(mode).capability_input_hashes(), {full, empty})
        for mode in ('prepare', 'apply', 'recover', 'inspect', 'archive-expired', None):
            self.assertEqual(self.system(mode).capability_input_hashes(), {full})

    def test_an_empty_input_capability_cannot_be_created_by_any_upgrade_mode(self):
        for mode in ('prepare', 'apply', 'recover'):
            system = self.system(mode)
            with patch.object(funded.upgrade, 'run') as run, self.assertRaisesRegex(ValueError, 'Exact committed capability input'):
                system.capability('sha256:' + 'd' * 64, {})
            run.assert_not_called()

    def test_the_registry_command_is_never_allowed_outside_the_active_registry_proof_or_cleanup(self):
        original = (funded.CAPABILITY_COMMAND,)
        both = (funded.CAPABILITY_COMMAND, funded.REGISTRY_CAPABILITY_COMMAND)
        for mode in ('prepare', 'apply', 'recover', 'inspect', None):
            self.assertEqual(self.system(mode).allowed_capability_commands(), original)
        proof = self.system('active-proof')
        self.assertEqual(proof.allowed_capability_commands(), original)
        proof.active_registry = True
        self.assertEqual(proof.allowed_capability_commands(), both)
        self.assertEqual(proof.image_capability_profile(), ('alterward-funded-runtime-2', 40, 'service-registry-040'))
        self.assertEqual(self.system('cleanup-probe').allowed_capability_commands(), both)
        self.assertEqual(self.system('active-proof').image_capability_profile(), ('alterward-funded-runtime-1', 39, None))


if __name__ == '__main__':
    unittest.main()
