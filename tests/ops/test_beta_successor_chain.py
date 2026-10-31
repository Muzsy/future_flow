"""Generation-chained successor authority: reader admission, then tester beta.

Real private files and the real Daily validators; only the Docker/DB boundary is
substituted, exactly like the first-generation authority tests.
"""
import datetime as dt
import json
import unittest
from unittest.mock import patch

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

    def runtime(self, root, terms, emails, billing=False):
        fx = self.fixture
        ids = ','.join(p['userId'] for p in terms['participants'])
        env = {'AI_PROJECT_BUDGET_USD': terms['projectUsd'], 'AI_USER_BUDGET_USD': terms['userUsd'],
               'CLOSED_BETA_USER_IDS': ids, 'NARRATIVE_PIPELINE_MODE': 'narrative-fiction-v2',
               'NARRATIVE_FICTION_GENERATION': 'v9', 'NARRATIVE_COHORT_USER_IDS': ids,
               'CLOSED_SITE_ALLOWED_EMAILS': ','.join(emails), 'AI_BUDGET_WINDOW_REQUIRED': 'true',
               'AI_FICTION_TIMEOUT_MS': '300000', 'AI_FICTION_MAX_REQUEST_BYTES': '196608',
               'AI_BUDGET_WINDOW_START': terms['startsAt'], 'AI_BUDGET_WINDOW_END': terms['endsAt']}
        if billing:  # compose default-off values reach api and worker only
            env.update(daily.SUCCESSOR_BILLING_DEFAULTS)
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
        elif purpose == 'schema-039':
            terms = prior
            selection = {'purpose': purpose, 'previousTermsSha256': hashed(prior), 'fromSchema': 38, 'toSchema': 39}
            plan = {'version': 'alterward-beta-successor-plan-2', 'purpose': purpose,
                    'observedAt': iso(at, True), 'expiresAt': iso(at + dt.timedelta(minutes=15), True),
                    'previousTermsSha256': hashed(prior), 'selectionSha256': hashed(selection),
                    'fromSchema': 38, 'toSchema': 39,
                    'allowedChanges': list(daily.SUCCESSOR_SCHEMA_ALLOWED_CHANGES)}
            readers = self.active_access['allowedEmails']
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
        files, release = self.runtime(root, terms, readers, billing=purpose == 'schema-039')
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

    def expose(self, number, value, *, window_changed, schema=False):
        fx, root = self.fixture, self.root(number)
        self.journal(number, ['apply-intent', 'held', 'database-intent', 'accounts-committed',
                              'authority-staged', 'exposure-intent', 'applied'])
        fx.write(root / 'readback.json', encoded({
            'version': daily.SUCCESSOR_VERSION, 'preparedSha256': daily.digest(encoded(value)),
            'sourceCommit': value['sourceCommit'], 'imageId': value['release']['target']['imageId'],
            'schema': 39, 'protectedDataUnchanged': True, 'previousSpendPreserved': True,
            'previousAllowanceClosed': window_changed, 'browserJourneyPassed': False,
            **({'fromSchema': 38} if schema else {}),
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

    def to_tester_tip(self):
        chain = self.chain
        chain.admit_readers()
        tester = chain.prepare(3, 'tester-beta', participants=chain.testers())
        chain.expose(3, tester, window_changed=True)
        return tester

    def test_schema_upgrade_does_not_need_the_prior_window_to_have_started(self):
        # The fixture (and a real operator) may upgrade while the just-opened tester
        # window is still a few minutes away from its start: nothing about it changes.
        chain = self.chain
        tester = self.to_tester_tip()
        start = dt.datetime.fromisoformat(tester['operation']['plan']['next']['startsAt'].replace('Z', '+00:00'))
        chain.at = start - dt.timedelta(minutes=2)
        daily.utcnow.return_value = chain.at + dt.timedelta(minutes=1)
        chain.prepare(4, 'schema-039')
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))

    def remove_generation(self, number):
        for path in sorted(self.chain.root(number).rglob('*'), reverse=True):
            path.unlink() if path.is_file() else path.rmdir()
        self.chain.root(number).rmdir()

    def test_schema_upgrade_chains_to_the_exposed_tip_and_keeps_window_readers_and_cohort(self):
        chain = self.chain
        tip_terms, tip_access = None, None
        self.to_tester_tip()
        tip_terms, tip_access = chain.terms, chain.active_access
        value = chain.prepare(4, 'schema-039')
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))
        self.assertEqual(daily.successor_effective_role(value, chain.root(4)), 'previous')
        self.assertEqual(daily.successor_active_state()['pending'], chain.root(4))
        chain.expose(4, value, window_changed=False, schema=True)
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))
        state = daily.successor_active_state()
        self.assertEqual((state['generation'], state['directory']), (4, chain.root(4)))
        self.assertEqual((state['terms'], state['access']), (tip_terms, tip_access))
        self.assertEqual(daily.successor_parent_context(4)[2]['purposes'][-1], 'tester-beta')

    def test_schema_upgrade_is_allowed_only_behind_the_first_generation_and_only_once(self):
        chain = self.chain
        # Not as the first generation.
        fx = chain.fixture
        selection = json.loads((fx.root / 'selection.json').read_bytes())
        selection['purpose'] = 'schema-039'
        fx.write(fx.root / 'selection.json', encoded(selection))
        value = json.loads((fx.root / 'prepared.json').read_bytes())
        value['selectionSha256'] = daily.digest(encoded(selection))
        fx.write(fx.root / 'prepared.json', encoded(value))
        self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))

    def test_a_second_schema_upgrade_is_refused_but_a_reader_step_may_follow(self):
        chain = self.chain
        self.to_tester_tip()
        first = chain.prepare(4, 'schema-039')
        chain.expose(4, first, window_changed=False, schema=True)
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))
        # The shipped chain has no fifth directory; give the validator room to prove
        # the rule itself rather than the directory limit.
        with patch.object(daily, 'SUCCESSOR_ROOT_NAMES', daily.SUCCESSOR_ROOT_NAMES + ('beta-successor-5',)):
            chain.prepare(5, 'schema-039')
            self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))
            for path in sorted(chain.root(5).rglob('*'), reverse=True):
                path.unlink() if path.is_file() else path.rmdir()
            chain.root(5).rmdir()
            self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))
            emails = sorted(set(chain.active_access['allowedEmails']) | {'late-reader@example.invalid'})
            reader = chain.prepare(5, 'reader-admission', emails=emails)
            chain.expose(5, reader, window_changed=False)
            self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))
            self.assertEqual(daily.successor_active_state()['generation'], 5)
            self.assertEqual(daily.successor_parent_context(5)[2]['purposes'][-1], 'schema-039')

    def test_schema_upgrade_cannot_change_terms_readers_selection_or_plan(self):
        chain = self.chain
        self.to_tester_tip()
        for label, mutate in [
            ('new terms', lambda v: chain.fixture.write(chain.root(4) / 'terms.json', encoded({**chain.terms, 'projectUsd': '11'}))),
            ('reader receipt', lambda v: chain.fixture.write(chain.root(4) / 'access.json', b'{}')),
            ('wrong target schema', lambda v: self.rewrite_selection(v, toSchema=40)),
            ('wrong source schema', lambda v: self.rewrite_selection(v, fromSchema=37)),
            ('string schema', lambda v: self.rewrite_selection(v, toSchema='39')),
            ('extra selection field', lambda v: self.rewrite_selection(v, readers={'allowedEmails': []})),
            ('plan schema drift', lambda v: self.rewrite_plan(v, toSchema=40)),
            ('plan extra field', lambda v: self.rewrite_plan(v, closePreviousAt='x')),
            ('unbounded validity', lambda v: self.rewrite_validity(v)),
            # B1: the recorded set of sources allowed to differ from the serving image is exact.
            ('allow-list missing', lambda v: self.rewrite_plan(v, allowedChanges=[])),
            ('allow-list widened to the narrative engine', lambda v: self.rewrite_plan(
                v, allowedChanges=sorted(v['operation']['plan']['allowedChanges'] + ['packages/ai/src/narrative.ts']))),
            ('allow-list narrowed', lambda v: self.rewrite_plan(
                v, allowedChanges=v['operation']['plan']['allowedChanges'][1:])),
            ('allow-list reordered', lambda v: self.rewrite_plan(
                v, allowedChanges=v['operation']['plan']['allowedChanges'][::-1])),
        ]:
            with self.subTest(label):
                value = chain.prepare(4, 'schema-039')
                mutate(value)
                self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))
                self.remove_generation(4)
        chain.prepare(4, 'schema-039')
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))

    def rewrite_selection(self, value, **changes):
        root = self.chain.root(4)
        selection = {**json.loads((root / 'selection.json').read_bytes()), **changes}
        self.chain.fixture.write(root / 'selection.json', encoded(selection))
        self.chain.fixture.write(root / 'prepared.json', encoded({**value, 'selectionSha256': daily.digest(encoded(selection))}))

    def rewrite_plan(self, value, **changes):
        plan = {**value['operation']['plan'], **changes}
        self.chain.fixture.write(self.chain.root(4) / 'prepared.json', encoded({**value, 'operation': {'plan': plan}}))

    def rewrite_validity(self, value):
        at = dt.datetime.fromisoformat(value['preparedAt'].replace('Z', '+00:00'))
        late = iso(at + dt.timedelta(minutes=45), True)
        plan = {**value['operation']['plan'], 'expiresAt': late}
        self.chain.fixture.write(self.chain.root(4) / 'prepared.json',
                                 encoded({**value, 'expiresAt': late, 'operation': {'plan': plan}}))

    def test_schema_upgrade_keeps_billing_at_its_default_off_configuration(self):
        chain = self.chain
        self.to_tester_tip()
        value = chain.prepare(4, 'schema-039')
        for role in ('target', 'recovery'):
            for service, key, bad in [('api', 'BILLING_ENABLED', 'true'), ('worker', 'BILLING_ENFORCEMENT', 'true'),
                                      ('api', 'STRIPE_SECRET_KEY', 'sk_test_synthetic'),
                                      ('worker', 'STRIPE_WEBHOOK_SECRET', 'whsec_synthetic'),
                                      ('web', 'BILLING_ENABLED', 'false'), ('api', 'BILLING_RESERVATION_TTL_SECONDS', '1')]:
                with self.subTest(role=role, service=service, key=key):
                    path = chain.root(4) / role / 'effective-compose.json'
                    original = path.read_bytes()
                    config = json.loads(original)
                    config['services'][service]['environment'][key] = bad
                    changed = encoded(config)
                    chain.fixture.write(path, changed)
                    manifest_path = chain.root(4) / role / 'manifest.json'
                    manifest_original = manifest_path.read_bytes()
                    manifest = json.loads(manifest_original)
                    manifest['effectiveComposeSha256'] = daily.digest(changed)
                    chain.fixture.write(manifest_path, encoded(manifest))
                    prepared = {**value, 'files': {**value['files'], role: {
                        **value['files'][role], 'effective-compose.json': daily.digest(changed),
                        'manifest.json': daily.digest(encoded(manifest))}}}
                    chain.fixture.write(chain.root(4) / 'prepared.json', encoded(prepared))
                    self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))
                    chain.fixture.write(path, original)
                    chain.fixture.write(manifest_path, manifest_original)
                    chain.fixture.write(chain.root(4) / 'prepared.json', encoded(value))
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))

    def test_schema_upgrade_readback_must_prove_039_reached_from_038(self):
        chain = self.chain
        self.to_tester_tip()
        value = chain.prepare(4, 'schema-039')
        chain.expose(4, value, window_changed=False, schema=True)
        path = chain.root(4) / 'readback.json'
        proof = json.loads(path.read_bytes())
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))
        for label, changed in [('schema 038', {**proof, 'schema': 38}), ('no source schema', {k: v for k, v in proof.items() if k != 'fromSchema'}),
                               ('other source schema', {**proof, 'fromSchema': 37}),
                               ('closed allowance', {**proof, 'previousAllowanceClosed': True}),
                               ('restored database', {**proof, 'databaseRestored': True})]:
            with self.subTest(label):
                chain.fixture.write(path, encoded(changed))
                self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))
        chain.fixture.write(path, encoded(proof))
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))

    def test_other_generations_cannot_claim_a_source_schema(self):
        chain = self.chain
        value = chain.admit_readers()
        path = chain.root(2) / 'readback.json'
        proof = json.loads(path.read_bytes())
        chain.fixture.write(path, encoded({**proof, 'fromSchema': 38}))
        self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))
        self.assertTrue(value)

    def test_only_the_schema_upgrade_may_finish_its_database_step_during_recovery(self):
        chain = self.chain
        self.to_tester_tip()
        recovered = ['apply-intent', 'held', 'database-intent', 'held-after-failure', 'closed', 'recovery-intent',
                     'held', 'database-intent', 'accounts-committed', 'authority-staged', 'exposure-intent', 'recovered']
        schema = chain.prepare(4, 'schema-039')
        chain.journal(4, recovered)
        chain.fixture.write(chain.root(4) / 'readback.json', encoded({
            'version': daily.SUCCESSOR_VERSION, 'preparedSha256': daily.digest(encoded(schema)),
            'sourceCommit': schema['sourceCommit'], 'imageId': schema['release']['recovery']['imageId'],
            'schema': 39, 'fromSchema': 38, 'protectedDataUnchanged': True, 'previousSpendPreserved': True,
            'previousAllowanceClosed': False, 'browserJourneyPassed': False,
            'operationSha256': hashed(schema['operation']), 'operationPaidAiCalls': 0,
            'paidAiCalls': 0, 'databaseRestored': False}))
        self.assertEqual(daily.successor_effective_role(schema, chain.root(4)), 'recovery')
        self.remove_generation(4)
        # The same recovery order is refused for accounting SQL (a tester window).
        window = chain.prepare(4, 'reader-admission', emails=sorted(set(chain.active_access['allowedEmails']) | {'late@example.invalid'}))
        chain.journal(4, recovered)
        with self.assertRaisesRegex(ValueError, 'without SQL replay'):
            daily.successor_effective_role(window, chain.root(4))

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
