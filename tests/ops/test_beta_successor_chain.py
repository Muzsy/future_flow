"""Generation-chained successor authority: reader admission, then tester beta.

Real private files and the real Daily validators; only the Docker/DB boundary is
substituted, exactly like the first-generation authority tests.
"""
import datetime as dt
import json
import unittest

import test_beta_successor_authority as authority

daily = authority.daily
encoded = authority.encoded
hashed = authority.hashed
TESTERS = ['tester-one@example.invalid', 'tester-two@example.invalid']


def iso(value, milliseconds=False):
    text = value.isoformat(timespec='milliseconds' if milliseconds else 'seconds')
    return text.replace('+00:00', 'Z')


class Chain:
    """Builds and exposes generation evidence on top of the first-generation fixture."""

    def __init__(self, case):
        self.case = case
        self.fixture = authority.SuccessorAuthorityTests()
        self.fixture.setUp()
        case.addCleanup(self.fixture.doCleanups)
        fx = self.fixture
        fx.access = {'teamDomain': 'team.cloudflareaccess.com', 'audience': 'a' * 64,
                     'allowedEmails': sorted([fx.prior['participants'][0]['email'], fx.trial_owner['email']])}
        fx.write(fx.owner / 'personal-beta-readers/access.json', encoded(fx.access))
        self.first = fx.prepare()
        fx.expose(self.first)
        self.terms = json.loads((fx.root / 'terms.json').read_bytes())
        self.active_access = fx.access
        self.active_root = fx.root
        self.active_role_files = self.first['files']['target']
        self.at = fx.now + dt.timedelta(minutes=11)
        daily.utcnow.return_value = self.at + dt.timedelta(minutes=1)

    def root(self, number):
        return self.fixture.owner / daily.SUCCESSOR_ROOT_NAMES[number - 1]

    def runtime(self, root, terms, emails):
        fx = self.fixture
        ids = ','.join(p['userId'] for p in terms['participants'])
        env = {'AI_PROJECT_BUDGET_USD': terms['projectUsd'], 'AI_USER_BUDGET_USD': terms['userUsd'],
               'CLOSED_BETA_USER_IDS': ids, 'NARRATIVE_PIPELINE_MODE': 'narrative-fiction-v2',
               'NARRATIVE_FICTION_GENERATION': 'v9', 'NARRATIVE_COHORT_USER_IDS': ids,
               'CLOSED_SITE_ALLOWED_EMAILS': ','.join(emails), 'AI_BUDGET_WINDOW_REQUIRED': 'true',
               'AI_FICTION_TIMEOUT_MS': '300000', 'AI_FICTION_MAX_REQUEST_BYTES': '196608',
               'AI_BUDGET_WINDOW_START': terms['startsAt'], 'AI_BUDGET_WINDOW_END': terms['endsAt']}
        files, release = {}, {}
        for role in ('target', 'recovery'):
            cfg = {'services': {'web': {'environment': {'CLOSED_SITE_ALLOWED_EMAILS': env['CLOSED_SITE_ALLOWED_EMAILS']}},
                                'api': {'environment': dict(env)},
                                'worker': {'environment': {k: v for k, v in env.items() if k != 'CLOSED_SITE_ALLOWED_EMAILS'}}}}
            data = ('runtime-' + root.name + terms['projectUsd'] + ','.join(emails)).encode()
            fx.write(root / role / 'server.env', data)
            fx.write(root / role / 'effective-compose.json', encoded(cfg))
            fx.write(root / role / 'pinned-image.json', b'pinned')
            manifest = {'commit': 'b' * 40, 'imageId': 'sha256:' + 'b' * 64,
                        'ownerEnvironmentSha256': daily.digest(data),
                        'effectiveComposeSha256': daily.digest(encoded(cfg))}
            fx.write(root / role / 'manifest.json', encoded(manifest))
            files[role] = {n: daily.digest((root / role / n).read_bytes()) for n in daily.RUNTIME_NAMES}
            release[role] = {'commit': 'b' * 40, 'imageId': 'sha256:' + 'b' * 64}
        return files, release

    def prepare(self, number, purpose, *, emails=None, participants=None, project='10', user='3.33'):
        fx, prior = self.fixture, self.terms
        root = self.root(number)
        at = self.at
        if purpose == 'reader-admission':
            terms = prior
            selection = {'purpose': purpose, 'previousTermsSha256': hashed(prior), 'readers': {'allowedEmails': emails}}
            plan = {'version': 'alterward-beta-successor-plan-2', 'purpose': purpose,
                    'observedAt': iso(at, True), 'expiresAt': iso(at + dt.timedelta(minutes=15), True),
                    'previousTermsSha256': hashed(prior), 'selectionSha256': hashed(selection)}
            fx.write(root / 'access.json', encoded({'allowedEmails': emails, 'audience': self.active_access['audience'],
                                                    'teamDomain': self.active_access['teamDomain']}))
            readers = emails
        else:
            terms = {'participants': participants, 'projectUsd': project, 'userUsd': user,
                     'startsAt': iso(at + dt.timedelta(minutes=10)),
                     'endsAt': iso(at + dt.timedelta(days=30, minutes=10))}
            selection = {'purpose': purpose, 'previousTermsSha256': hashed(prior),
                         'closePreviousAt': iso(at + dt.timedelta(minutes=5)), 'next': terms}
            normalized = lambda t: {**t, **{k: t[k].replace('Z', '.000Z') for k in ('startsAt', 'endsAt')}}
            plan = {'version': 'alterward-beta-successor-plan-2', 'purpose': purpose,
                    'previous': normalized(prior), 'next': normalized(terms),
                    'observedAt': iso(at, True), 'expiresAt': iso(at + dt.timedelta(minutes=15), True),
                    'closePreviousAt': selection['closePreviousAt'].replace('Z', '.000Z'),
                    'previousTermsSha256': hashed(prior), 'selectionSha256': hashed(selection)}
            readers = self.active_access['allowedEmails']
        fx.write(root / 'terms.json', encoded(terms))
        fx.write(root / 'selection.json', encoded(selection))
        for name in daily.RUNTIME_NAMES:
            fx.write(root / 'previous' / name, (fx.owner / name).read_bytes())
        files, release = self.runtime(root, terms, readers)
        files['previous'] = self.active_role_files
        authority_paths = (daily.reader_config_paths() + daily.personal_config_paths()
                           + daily.funded_tree_paths(fx.parent)
                           + [p for n in range(1, number) for p in daily.successor_tree_paths(self.root(n))])
        parent = self.active_root
        value = {'version': daily.SUCCESSOR_VERSION, 'sourceCommit': 'b' * 40, 'bundleSha256': 'c' * 64,
                 'preparedAt': iso(at, True), 'expiresAt': iso(at + dt.timedelta(minutes=15), True),
                 'baseline': {'files': self.active_role_files,
                              'authority': {str(p): daily.digest(p.read_bytes()) for p in authority_paths}},
                 'release': release, 'files': files, 'database': {}, 'operation': {'plan': plan},
                 'parentPreparedSha256': daily.digest((parent / 'prepared.json').read_bytes()),
                 'parentJournalSha256': daily.digest((parent / 'journal.json').read_bytes()),
                 'parentReadbackSha256': daily.digest((parent / 'readback.json').read_bytes()),
                 'termsSha256': daily.digest(encoded(terms)), 'selectionSha256': daily.digest(encoded(selection))}
        fx.write(root / 'prepared.json', encoded(value))
        return value

    def journal(self, number, states):
        root = self.root(number)
        rows, previous = [], None
        for state in states:
            row = {'state': state, 'changedAt': iso(self.at + dt.timedelta(seconds=30), True), 'previousSha256': previous}
            row['sha256'] = daily.digest(encoded(row))
            previous = row['sha256']
            rows.append(row)
        self.fixture.write(root / 'journal.json', encoded({
            'version': daily.SUCCESSOR_VERSION,
            'preparedSha256': daily.digest((root / 'prepared.json').read_bytes()), 'states': rows}))

    def expose(self, number, value, *, window_changed):
        fx, root = self.fixture, self.root(number)
        self.journal(number, ['apply-intent', 'held', 'database-intent', 'accounts-committed',
                              'authority-staged', 'exposure-intent', 'applied'])
        fx.write(root / 'readback.json', encoded({
            'version': daily.SUCCESSOR_VERSION, 'preparedSha256': daily.digest(encoded(value)),
            'sourceCommit': value['sourceCommit'], 'imageId': value['release']['target']['imageId'],
            'schema': 39, 'protectedDataUnchanged': True, 'previousSpendPreserved': True,
            'previousAllowanceClosed': window_changed, 'browserJourneyPassed': False,
            'operationSha256': hashed(value['operation']), 'operationPaidAiCalls': 0,
            'paidAiCalls': 0, 'databaseRestored': False}))
        for name in daily.RUNTIME_NAMES:
            fx.write(fx.owner / name, (root / 'target' / name).read_bytes())
        self.active_root = root
        self.active_role_files = value['files']['target']
        receipt = root / 'access.json'
        if receipt.exists():
            self.active_access = json.loads(receipt.read_bytes())
        self.terms = json.loads((root / 'terms.json').read_bytes())
        self.at = self.at + dt.timedelta(minutes=20)
        daily.utcnow.return_value = self.at + dt.timedelta(minutes=1)

    def admit_readers(self):
        emails = sorted(set(self.active_access['allowedEmails']) | set(TESTERS))
        value = self.prepare(2, 'reader-admission', emails=emails)
        self.expose(2, value, window_changed=False)
        return value

    def testers(self):
        owner = self.fixture.trial_owner
        return [owner, {'email': TESTERS[0], 'userId': '11111111-1111-4111-8111-111111111111'},
                {'email': TESTERS[1], 'userId': '33333333-3333-4333-8333-333333333333'}]


class ChainTests(unittest.TestCase):
    def setUp(self):
        self.chain = Chain(self)
        self.daily = daily

    def test_first_generation_stays_active_authority_with_one_directory(self):
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))
        state = daily.successor_active_state()
        self.assertEqual(state['generation'], 1)
        self.assertEqual(state['directory'], self.chain.fixture.root)

    def test_reader_admission_changes_only_the_reader_list_and_keeps_the_window(self):
        first_terms = self.chain.terms
        value = self.chain.admit_readers()
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))
        state = daily.successor_active_state()
        self.assertEqual((state['generation'], state['directory']), (2, self.chain.root(2)))
        self.assertEqual(state['terms'], first_terms)
        self.assertEqual(state['access']['allowedEmails'], sorted(set(self.chain.fixture.access['allowedEmails']) | set(TESTERS)))
        self.assertEqual(daily.active_funded_directory(), self.chain.root(2))
        self.assertEqual(value['operation']['plan']['purpose'], 'reader-admission')

    def test_unfinished_reader_admission_never_changes_the_effective_runtime(self):
        value = self.chain.prepare(2, 'reader-admission', emails=sorted(set(self.chain.active_access['allowedEmails']) | set(TESTERS)))
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))
        self.assertEqual(daily.successor_active_state()['pending'], self.chain.root(2))
        self.assertEqual(daily.active_funded_directory(), self.chain.fixture.root)
        self.assertEqual(daily.successor_effective_role(value, self.chain.root(2)), 'previous')

    def test_reader_admission_cannot_remove_a_reader_or_change_anything_else(self):
        chain = self.chain
        current = chain.active_access['allowedEmails']
        for label, emails in [('no addition', current), ('removal', sorted([current[0], TESTERS[0]])),
                              ('unsorted', [TESTERS[1], TESTERS[0]] + current)]:
            with self.subTest(label):
                chain.prepare(2, 'reader-admission', emails=emails)
                self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))
                for path in sorted(chain.root(2).rglob('*'), reverse=True):
                    path.unlink() if path.is_file() else path.rmdir()
                chain.root(2).rmdir()
        value = chain.prepare(2, 'reader-admission', emails=sorted(set(current) | set(TESTERS)))
        terms = json.loads((chain.root(2) / 'terms.json').read_bytes())
        terms['projectUsd'] = '4'
        chain.fixture.write(chain.root(2) / 'terms.json', encoded(terms))
        value['termsSha256'] = daily.digest(encoded(terms))
        chain.fixture.write(chain.root(2) / 'prepared.json', encoded(value))
        self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))

    def test_reader_runtime_must_carry_exactly_the_approved_reader_list(self):
        chain = self.chain
        value = chain.admit_readers()
        for service in ('web', 'api'):
            with self.subTest(service=service):
                path = chain.root(2) / 'target' / 'effective-compose.json'
                original = path.read_bytes()
                cfg = json.loads(original)
                cfg['services'][service]['environment']['CLOSED_SITE_ALLOWED_EMAILS'] += ',stranger@example.invalid'
                chain.fixture.write(path, encoded(cfg))
                self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))
                chain.fixture.write(path, original)
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))
        self.assertEqual(value['release']['target']['commit'], 'b' * 40)

    def test_reader_readback_cannot_claim_a_closed_allowance(self):
        chain = self.chain
        value = chain.admit_readers()
        proof = json.loads((chain.root(2) / 'readback.json').read_bytes())
        chain.fixture.write(chain.root(2) / 'readback.json', encoded({**proof, 'previousAllowanceClosed': True}))
        self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))
        chain.fixture.write(chain.root(2) / 'readback.json', encoded(proof))
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))
        self.assertTrue(value)

    def test_a_later_generation_requires_every_earlier_one_to_be_fully_exposed(self):
        chain = self.chain
        chain.prepare(2, 'reader-admission', emails=sorted(set(chain.active_access['allowedEmails']) | set(TESTERS)))
        chain.active_root = chain.root(2)
        # Even a well-formed generation 3 cannot be consumed behind an unfinished 2.
        chain.fixture.write(chain.root(3) / 'prepared.json', b'{}')
        self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))

    def test_generations_must_be_contiguous(self):
        chain = self.chain
        chain.fixture.write(chain.root(3) / 'prepared.json', b'{}')
        self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))

    def test_tester_beta_chains_to_the_exposed_reader_generation(self):
        chain = self.chain
        chain.admit_readers()
        value = chain.prepare(3, 'tester-beta', participants=chain.testers())
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))
        self.assertEqual(daily.successor_effective_role(value, chain.root(3)), 'previous')
        chain.expose(3, value, window_changed=True)
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))
        state = daily.successor_active_state()
        self.assertEqual((state['generation'], state['terms']['projectUsd'], state['terms']['userUsd']), (3, '10', '3.33'))
        self.assertEqual(len(state['terms']['participants']), 3)

    def test_tester_beta_requires_exactly_three_readable_participants_and_the_approved_cap(self):
        chain = self.chain
        chain.admit_readers()
        users = chain.testers()
        cases = [('two participants', users[:2], '10', '3.33'),
                 ('four participants', users + [{'email': 'x@example.invalid', 'userId': '44444444-4444-4444-8444-444444444444'}], '10', '3.33'),
                 ('raised project cap', users, '11', '3.33'),
                 ('raised user cap', users, '10', '3.34'),
                 ('owner window cap', users, '3', '3'),
                 ('unreadable participant', users[:2] + [{'email': 'unlisted@example.invalid', 'userId': '55555555-5555-4555-8555-555555555555'}], '10', '3.33'),
                 ('duplicate user', [users[0], users[1], {**users[2], 'userId': users[1]['userId']}], '10', '3.33')]
        for label, participants, project, user in cases:
            with self.subTest(label):
                chain.prepare(3, 'tester-beta', participants=participants, project=project, user=user)
                self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))
                for path in sorted(chain.root(3).rglob('*'), reverse=True):
                    path.unlink() if path.is_file() else path.rmdir()
                chain.root(3).rmdir()

    def test_first_generation_remains_owner_only_and_cannot_claim_tester_beta(self):
        fx = self.chain.fixture
        # Replace the exposed first generation by a tester-beta claim at generation 1.
        selection = json.loads((fx.root / 'selection.json').read_bytes())
        selection['purpose'] = 'tester-beta'
        fx.write(fx.root / 'selection.json', encoded(selection))
        value = json.loads((fx.root / 'prepared.json').read_bytes())
        value['selectionSha256'] = daily.digest(encoded(selection))
        fx.write(fx.root / 'prepared.json', encoded(value))
        self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))

    def test_the_tester_window_can_be_opened_only_once(self):
        chain = self.chain
        chain.admit_readers()
        value = chain.prepare(3, 'tester-beta', participants=chain.testers())
        chain.expose(3, value, window_changed=True)
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))
        self.assertEqual(daily.successor_active_state()['generation'], 3)
        # A second 10 / 3.33 USD window is refused even though it is well formed.
        chain.prepare(4, 'tester-beta', participants=chain.testers())
        self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))
        for path in sorted(chain.root(4).rglob('*'), reverse=True):
            path.unlink() if path.is_file() else path.rmdir()
        chain.root(4).rmdir()
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))
        # Only admitting more readers (no money) may still follow it.
        emails = sorted(set(chain.active_access['allowedEmails']) | {'late-reader@example.invalid'})
        chain.prepare(4, 'reader-admission', emails=emails)
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))

    def test_a_reader_step_may_follow_the_tester_window_and_the_record_of_it_is_kept(self):
        chain = self.chain
        chain.admit_readers()
        tester = chain.prepare(3, 'tester-beta', participants=chain.testers())
        chain.expose(3, tester, window_changed=True)
        emails = sorted(set(chain.active_access['allowedEmails']) | {'late-reader@example.invalid'})
        reader = chain.prepare(4, 'reader-admission', emails=emails)
        chain.expose(4, reader, window_changed=False)
        self.assertEqual(daily.successor_active_state()['generation'], 4)
        self.assertEqual(daily.successor_parent_context(4)[2]['purposes'][-1], 'tester-beta')

    def test_earlier_generation_evidence_is_part_of_the_next_baseline(self):
        chain = self.chain
        chain.admit_readers()
        chain.prepare(3, 'tester-beta', participants=chain.testers())
        proof = chain.root(2) / 'readback.json'
        original = proof.read_bytes()
        chain.fixture.write(proof, original + b' ')
        self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))
        chain.fixture.write(proof, original)
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))

    def test_runtime_drift_after_a_later_generation_fails_closed(self):
        chain = self.chain
        chain.admit_readers()
        chain.fixture.write(chain.fixture.owner / 'server.env', b'drift')
        self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))

    def test_replay_authority_follows_the_last_exposed_generation(self):
        chain = self.chain
        first = authority.replay.active_funded_runtime(daily, authority.test_read)
        value = chain.admit_readers()
        current = authority.replay.active_funded_runtime(daily, authority.test_read)
        self.assertEqual(current['preparedSha256'], daily.digest(encoded(value)))
        self.assertNotEqual(current['authoritySha256'], first['authoritySha256'])
        with self.assertRaises(ValueError):
            authority.replay.require_funded_runtime(daily, authority.test_read, first)


if __name__ == '__main__':
    unittest.main()
