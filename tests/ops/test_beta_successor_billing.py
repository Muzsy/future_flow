"""Billing-config successor generation: Daily authority and root adapter.

Real private files and the real Daily validators; only the Docker/DB boundary is
substituted, exactly like the other chained-generation tests. Nothing here touches a
real server, key or Stripe account.
"""
import copy
import datetime as dt
import json
import unittest
from unittest.mock import Mock, patch

import test_beta_successor_authority as authority
import test_beta_successor_chain as chained
import test_beta_successor_chain_root as rootbase
from test_beta_successor_chain_root import ChainRootBase, daily, funded, root

encoded = authority.encoded
hashed = authority.hashed
TEST_KEY, LIVE_KEY, WEBHOOK, FOUNDERS = chained.TEST_KEY, chained.LIVE_KEY, chained.WEBHOOK, chained.FOUNDERS


class BillingChainTests(unittest.TestCase):
    def setUp(self):
        self.chain = chained.Chain(self)
        chain = self.chain
        chain.admit_readers()
        tester = chain.prepare(3, 'tester-beta', participants=chain.testers())
        chain.expose(3, tester, window_changed=True)

    def selection(self, stage='sandbox', **changes):
        return chained.billing_selection(hashed(self.chain.terms), stage, **changes)

    def expose(self, number, stage):
        value = self.chain.prepare(number, 'billing-config', selection=self.selection(stage))
        self.chain.expose(number, value, window_changed=False)
        return value

    def refused(self, number, **kwargs):
        """Prepare a candidate that Daily must refuse, then remove it again."""
        self.chain.prepare(number, 'billing-config', **kwargs)
        self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))
        for path in sorted(self.chain.root(number).rglob('*'), reverse=True):
            path.unlink() if path.is_file() else path.rmdir()
        self.chain.root(number).rmdir()
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))

    def test_the_sandbox_stage_keeps_window_readers_cohort_and_database(self):
        before = daily.successor_active_state()
        value = self.expose(4, 'sandbox')
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))
        state = daily.successor_active_state()
        self.assertEqual((state['generation'], state['directory']), (4, self.chain.root(4)))
        self.assertEqual((state['terms'], state['access']), (before['terms'], before['access']))
        self.assertEqual(value['operation']['plan']['purpose'], 'billing-config')
        self.assertEqual(daily.successor_parent_context(5)[2]['purposes'][-1], 'billing-config:sandbox')

    def test_the_shipped_chain_has_room_for_the_three_billing_stages(self):
        self.assertEqual(len(daily.SUCCESSOR_ROOT_NAMES), 7)
        self.assertEqual(tuple(root.ROOT_NAMES), tuple(daily.SUCCESSOR_ROOT_NAMES))
        self.expose(4, 'sandbox')
        self.expose(5, 'live')
        self.expose(6, 'enforce')
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))
        self.assertEqual(daily.successor_active_state()['generation'], 6)

    def test_the_live_stage_may_skip_the_sandbox_but_not_follow_enforcement(self):
        self.expose(4, 'live')
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))
        self.expose(5, 'enforce')
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))
        self.refused(6, selection=self.selection('live'))

    def test_every_stage_is_once_only_and_ordered(self):
        self.refused(4, selection=self.selection('enforce'))  # enforcement needs the live stage first
        self.expose(4, 'sandbox')
        self.refused(5, selection=self.selection('sandbox'))
        self.expose(5, 'live')
        self.refused(6, selection=self.selection('sandbox'))  # no test configuration after the live one
        self.refused(6, selection=self.selection('live'))
        self.expose(6, 'enforce')
        self.refused(7, selection=self.selection('enforce'))

    def test_the_selection_shape_is_exact_and_test_keys_never_enforce(self):
        previous = hashed(self.chain.terms)
        mutations = {
            'test mode enforcing': {'enforcement': True}, 'live mode in the sandbox stage': {'mode': 'live'},
            'disabled': {'enabled': False}, 'unknown stage': {'stage': 'later'},
            'price': {'priceId': 'prod_x'}, 'coupon': {'couponId': 'bad coupon'},
            'api version': {'apiVersion': 'latest'}, 'http return address': {'successUrl': 'http://alterward.com/b'},
            'return address with credentials': {'cancelUrl': 'https://user@alterward.com/b'},
            'return address with a port': {'cancelUrl': 'https://alterward.com:444/b'},
            'quote in the address': {'successUrl': "https://alterward.com/b'x"},
            'unsorted founders': {'founderUserIds': list(reversed(FOUNDERS))},
            'duplicate founders': {'founderUserIds': [FOUNDERS[0], FOUNDERS[0]]},
            'not a uuid': {'founderUserIds': ['x']}, 'eleven founders': {'founderUserIds': [
                '%08d-1111-4111-8111-111111111111' % n for n in range(11)]},
            'ttl too short': {'reservationTtlSeconds': 599}, 'ttl as string': {'reservationTtlSeconds': '7200'},
            'ttl as bool': {'reservationTtlSeconds': True}, 'secret digest': {'secretKeySha256': 'x'},
        }
        for label, changes in mutations.items():
            with self.subTest(label):
                selection = chained.billing_selection(previous, **changes)
                with self.assertRaises(ValueError):
                    daily.successor_billing_selection(selection)
                with self.assertRaises(ValueError):
                    root.billing_selection(selection)
        live = chained.billing_selection(previous, 'live', enforcement=True)
        with self.assertRaises(ValueError):
            daily.successor_billing_selection(live)  # the live stage does not enforce; the last stage does
        extra = self.selection()
        extra['billing']['extra'] = 1
        for selection in (extra, {**self.selection(), 'next': {}}, {k: v for k, v in self.selection().items() if k != 'billing'}):
            with self.assertRaises(ValueError):
                daily.successor_billing_selection(selection)

    def test_the_runtime_must_carry_exactly_the_selected_values_on_api_and_worker(self):
        selection = self.selection()
        good = chained.billing_environment(selection)
        for label, change in {
            'billing off': {'BILLING_ENABLED': 'false'}, 'enforcing': {'BILLING_ENFORCEMENT': 'true'},
            'other price': {'STRIPE_PRICE_ID': 'price_other'}, 'other coupon': {'STRIPE_FOUNDER_COUPON_ID': 'other'},
            'other api version': {'STRIPE_API_VERSION': '2026-01-01'},
            'other return address': {'BILLING_SUCCESS_URL': 'https://alterward.com/elsewhere'},
            'other founders': {'BILLING_FOUNDER_USER_IDS': FOUNDERS[0]},
            'other ttl': {'BILLING_RESERVATION_TTL_SECONDS': '3600'},
            'other secret': {'STRIPE_SECRET_KEY': 'sk_test_' + 'z' * 24},
            'live secret in a test selection': {'STRIPE_SECRET_KEY': LIVE_KEY},
            'other webhook secret': {'STRIPE_WEBHOOK_SECRET': 'whsec_' + 'z' * 24},
            'no secret': {'STRIPE_SECRET_KEY': ''},
        }.items():
            with self.subTest(label):
                self.refused(4, selection=selection, billing_env={**good, **change})

    def test_the_web_service_never_carries_billing_values(self):
        value = self.chain.prepare(4, 'billing-config', selection=self.selection())
        for role in ('target', 'recovery'):
            path = self.chain.root(4) / role / 'effective-compose.json'
            original = path.read_bytes()
            config = json.loads(original)
            config['services']['web']['environment']['BILLING_ENABLED'] = 'true'
            changed = encoded(config)
            self.chain.fixture.write(path, changed)
            manifest_path = self.chain.root(4) / role / 'manifest.json'
            manifest_original = manifest_path.read_bytes()
            manifest = {**json.loads(manifest_original), 'effectiveComposeSha256': daily.digest(changed)}
            self.chain.fixture.write(manifest_path, encoded(manifest))
            prepared = {**value, 'files': {**value['files'], role: {
                **value['files'][role], 'effective-compose.json': daily.digest(changed),
                'manifest.json': daily.digest(encoded(manifest))}}}
            self.chain.fixture.write(self.chain.root(4) / 'prepared.json', encoded(prepared))
            self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))
            self.chain.fixture.write(path, original)
            self.chain.fixture.write(manifest_path, manifest_original)
            self.chain.fixture.write(self.chain.root(4) / 'prepared.json', encoded(value))
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))

    def test_plan_selection_terms_and_receipt_cannot_change(self):
        for label, kwargs in {
            'plan names another stage': {'plan_changes': {'stage': 'live'}},
            'plan carries a window': {'plan_changes': {'next': {}}},
            'plan names another purpose': {'plan_changes': {'purpose': 'reader-admission'}},
            'plan binds other previous terms': {'plan_changes': {'previousTermsSha256': 'a' * 64}},
            'plan binds another selection': {'plan_changes': {'selectionSha256': 'a' * 64}},
            'plan has another version': {'plan_changes': {'version': 'alterward-beta-successor-plan-1'}},
            'allow-list missing': {'plan_changes': {'allowedChanges': []}},
            'allow-list names the engine': {'plan_changes': {'allowedChanges': [
                'packages/ai/src/narrative.ts', 'packages/database/src/index.ts']}},
            'allow-list names the schema list': {'plan_changes': {'allowedChanges': list(
                daily.SUCCESSOR_SCHEMA_ALLOWED_CHANGES)}},
            'allow-list hashes missing': {'plan_changes': {'allowedChangeHashes': {}}},
            'allow-list hash of another path': {'plan_changes': {'allowedChangeHashes': {
                'packages/ai/src/narrative.ts': 'a' * 64}}},
            'allow-list hash not a digest': {'plan_changes': {'allowedChangeHashes': {
                'packages/database/src/index.ts': 'xyz'}}},
            'allow-list hash recorded as none': {'plan_changes': {'allowedChangeHashes': {
                'packages/database/src/index.ts': None}}},
        }.items():
            with self.subTest(label):
                self.refused(4, selection=self.selection(), **kwargs)
        # A billing generation never carries a reader receipt and never closes an allowance.
        value = self.chain.prepare(4, 'billing-config', selection=self.selection())
        self.chain.fixture.write(self.chain.root(4) / 'access.json', encoded(self.chain.active_access))
        self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))
        (self.chain.root(4) / 'access.json').unlink()
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))
        self.assertEqual(value['termsSha256'], daily.digest(encoded(self.chain.terms)))

    def test_the_readback_must_prove_039_and_an_unchanged_window(self):
        value = self.expose(4, 'sandbox')
        path = self.chain.root(4) / 'readback.json'
        proof = json.loads(path.read_bytes())
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))
        for label, changed in [('schema 038', {**proof, 'schema': 38}), ('a source schema', {**proof, 'fromSchema': 38}),
                               ('closed allowance', {**proof, 'previousAllowanceClosed': True}),
                               ('restored database', {**proof, 'databaseRestored': True}),
                               ('paid call', {**proof, 'operationPaidAiCalls': 1})]:
            with self.subTest(label):
                self.chain.fixture.write(path, encoded(changed))
                self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))
        self.chain.fixture.write(path, encoded(proof))
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))
        self.assertEqual(proof['imageId'], value['release']['target']['imageId'])

    def test_a_later_generation_binds_the_billing_generation_into_its_baseline(self):
        self.expose(4, 'sandbox')
        emails = sorted(set(self.chain.active_access['allowedEmails']) | {'late-reader@example.invalid'})
        reader = self.chain.prepare(5, 'reader-admission', emails=emails)
        self.chain.expose(5, reader, window_changed=False)
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))
        selection = json.loads((self.chain.root(4) / 'selection.json').read_bytes())
        self.chain.fixture.write(self.chain.root(4) / 'selection.json',
                                 encoded({**selection, 'previousTermsSha256': 'a' * 64}))
        self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))


class BillingRootTests(ChainRootBase):
    def selection(self, stage='sandbox', **changes):
        return chained.billing_selection(root.canonical_sha(self.chain.terms), stage, **changes)

    def text(self, **billing):
        text = rootbase.EnvironmentTests.text(self)
        text += "PUBLIC_HOST='alterward.com'\n"
        return text + ''.join(k + "='" + v + "'\n" for k, v in billing.items())

    def candidate(self, selection=None, text=None, secrets='default', tag='alterward:contabo-aaaaaaaaaaaa'):
        selection = selection or self.selection()
        if secrets == 'default':
            secrets = {'secretKey': TEST_KEY, 'webhookSecret': WEBHOOK}
        return root.candidate_environment(self.text() if text is None else text, selection, tag,
                                          self.chain.terms, secrets).decode()

    def test_the_purpose_belongs_to_later_generations_and_changes_no_allowance(self):
        self.assertEqual(root.selection_values(self.selection()), {})
        self.assertTrue(root.keeps_window(self.selection()))
        self.assertEqual(self.system('apply', selection=self.selection()).generation, 1)
        with self.assertRaisesRegex(ValueError, 'purpose for this generation'):
            self.system('apply', selection=self.selection()).selected()
        self.chain.admit_readers()
        self.assertEqual(self.system(selection=self.selection()).selected()['purpose'], 'billing-config')
        runtime = root.runtime_selection(self.selection(), self.chain.terms)
        self.assertEqual(runtime['cohortUserIds'], [p['userId'] for p in self.chain.terms['participants']])
        with self.assertRaises(ValueError):
            root.runtime_selection(self.selection())

    def test_the_environment_gains_exactly_the_eleven_billing_values_and_the_tag(self):
        before = funded.upgrade.server_environment(self.text())
        after = funded.upgrade.server_environment(self.candidate())
        changed = {k for k in set(before) | set(after) if before.get(k) != after.get(k)}
        self.assertEqual(changed, set(root.BILLING_KEYS) | {'ALTERWARD_TAG'})
        self.assertEqual(after['STRIPE_SECRET_KEY'], TEST_KEY)
        self.assertEqual(after['BILLING_ENABLED'], 'true')
        self.assertEqual(after['BILLING_ENFORCEMENT'], 'false')
        self.assertEqual(after['BILLING_FOUNDER_USER_IDS'], ','.join(FOUNDERS))
        self.assertEqual(after['OPENAI_API_KEY'], 'synthetic-preserved')

    def test_existing_billing_lines_are_replaced_in_place_and_nothing_else_moves(self):
        live = self.selection('live')
        previous = {**funded.BILLING_DEFAULTS, 'BILLING_ENABLED': 'true', 'STRIPE_SECRET_KEY': TEST_KEY,
                    'STRIPE_WEBHOOK_SECRET': WEBHOOK}
        text = self.text(**previous)
        after = funded.upgrade.server_environment(self.candidate(
            live, text, {'secretKey': LIVE_KEY, 'webhookSecret': WEBHOOK}))
        self.assertEqual(after['STRIPE_SECRET_KEY'], LIVE_KEY)
        self.assertEqual(sum(line.startswith('STRIPE_SECRET_KEY=') for line in self.candidate(
            live, text, {'secretKey': LIVE_KEY, 'webhookSecret': WEBHOOK}).splitlines()), 1)

    def test_the_secrets_must_match_the_selected_digests_and_mode(self):
        for label, secrets in {
            'other key': {'secretKey': 'sk_test_' + 'z' * 24, 'webhookSecret': WEBHOOK},
            'other webhook secret': {'secretKey': TEST_KEY, 'webhookSecret': 'whsec_' + 'z' * 24},
            'live key for a test selection': {'secretKey': LIVE_KEY, 'webhookSecret': WEBHOOK},
            'key shape': {'secretKey': 'x', 'webhookSecret': WEBHOOK}, 'webhook shape': {'secretKey': TEST_KEY, 'webhookSecret': 'x'},
            'extra field': {'secretKey': TEST_KEY, 'webhookSecret': WEBHOOK, 'other': 'x'},
            'missing field': {'secretKey': TEST_KEY}, 'numbers': {'secretKey': 1, 'webhookSecret': 2},
            'none at all': None,
        }.items():
            with self.subTest(label), self.assertRaises(ValueError):
                self.candidate(secrets=secrets)

    def test_the_return_addresses_must_use_the_production_host(self):
        for host in ('beta.example.com', ''):
            with self.subTest(host), self.assertRaisesRegex(ValueError, 'production host'):
                self.candidate(text=self.text().replace("PUBLIC_HOST='alterward.com'", "PUBLIC_HOST='" + host + "'"))
        with self.assertRaisesRegex(ValueError, 'production host'):
            self.candidate(selection=self.selection(cancelUrl='https://www.alterward.com/billing?checkout=cancel'))

    def test_an_unrelated_environment_change_cannot_ride_along(self):
        text = self.text()
        with patch.object(funded, 'narrative_environment', side_effect=lambda t, r: t.replace(
                "OPENAI_API_KEY='synthetic-preserved'", "OPENAI_API_KEY='changed'")):
            with self.assertRaisesRegex(ValueError, 'Unrelated authority'):
                self.candidate(text=text)

    def test_stage_rules_start_from_exactly_the_state_each_stage_expects(self):
        default = dict(funded.BILLING_DEFAULTS)
        sandbox = {**default, 'BILLING_ENABLED': 'true', 'STRIPE_SECRET_KEY': TEST_KEY, 'STRIPE_WEBHOOK_SECRET': WEBHOOK}
        live_values = root.billing_values(self.selection('live'), {'PUBLIC_HOST': 'alterward.com'},
                                          {'secretKey': LIVE_KEY, 'webhookSecret': WEBHOOK})
        live = dict(live_values, BILLING_ENFORCEMENT='false')
        stage = root.require_billing_stage
        stage(self.selection('sandbox'), default, ())
        stage(self.selection('sandbox'), {}, ())  # a server environment without any billing line is the default
        stage(self.selection('live'), default, ())
        stage(self.selection('live'), sandbox, ('billing-config:sandbox',))
        stage(self.selection('enforce'), {**live, 'PUBLIC_HOST': 'alterward.com'}, ('billing-config:live',))
        refusals = [
            ('sandbox after configuration', 'sandbox', sandbox, ()), ('sandbox after live', 'sandbox', default, ('billing-config:live',)),
            ('sandbox twice', 'sandbox', default, ('billing-config:sandbox',)),
            ('live twice', 'live', default, ('billing-config:live',)),
            ('live over a live key', 'live', {**live, 'PUBLIC_HOST': 'alterward.com'}, ()),
            ('live after enforcement', 'live', sandbox, ('billing-config:enforce',)),
            ('enforce without live', 'enforce', {**live, 'PUBLIC_HOST': 'alterward.com'}, ()),
            ('enforce over a test configuration', 'enforce', {**sandbox, 'PUBLIC_HOST': 'alterward.com'}, ('billing-config:live',)),
            ('enforce that also moves another value', 'enforce',
             {**live, 'STRIPE_PRICE_ID': 'price_other', 'PUBLIC_HOST': 'alterward.com'}, ('billing-config:live',)),
            ('enforce when already enforcing', 'enforce',
             {**live, 'BILLING_ENFORCEMENT': 'true', 'PUBLIC_HOST': 'alterward.com'}, ('billing-config:live',)),
            ('enforce twice', 'enforce', {**live, 'PUBLIC_HOST': 'alterward.com'},
             ('billing-config:live', 'billing-config:enforce')),
        ]
        for label, name, environment, done in refusals:
            with self.subTest(label), self.assertRaises(ValueError):
                stage(self.selection(name), environment, done)

    def test_enforcement_changes_only_the_flag_and_needs_no_secret_resend(self):
        live = self.selection('live')
        text = self.candidate(live, secrets={'secretKey': LIVE_KEY, 'webhookSecret': WEBHOOK})
        enforce = self.selection('enforce')
        after = funded.upgrade.server_environment(root.candidate_environment(
            text, enforce, 'alterward:contabo-aaaaaaaaaaaa', self.chain.terms, None).decode())
        before = funded.upgrade.server_environment(text)
        self.assertEqual({k for k in set(before) | set(after) if before.get(k) != after.get(k)}, {'BILLING_ENFORCEMENT'})
        self.assertEqual(after['BILLING_ENFORCEMENT'], 'true')
        with self.assertRaises(ValueError):  # secrets that are not in the protected environment cannot be assumed
            root.candidate_environment(self.text(), enforce, 'alterward:contabo-aaaaaaaaaaaa', self.chain.terms, None)

    def rendered(self, **billing):
        def service(extra=None):
            return {'image': 'x', 'environment': {'AI_PROJECT_BUDGET_USD': '10', 'CLOSED_BETA_USER_IDS': 'u', **(extra or {})}}
        return {'services': {'web': {'image': 'x', 'environment': {}}, 'api': service(billing), 'worker': service(billing)}}

    def test_the_rendered_configuration_may_differ_only_by_the_billing_delta_on_api_and_worker(self):
        selection, previous = self.selection(), self.chain.terms
        old = self.rendered()
        new = self.rendered(**chained.billing_environment(selection))
        self.assertEqual(root.normalized(new, selection, previous), root.normalized(old, selection, previous))
        for service, key in (('api', 'AI_PROJECT_BUDGET_USD'), ('worker', 'CLOSED_BETA_USER_IDS')):
            drift = copy.deepcopy(new)
            drift['services'][service]['environment'][key] = 'changed'
            with self.subTest(service=service, key=key):
                self.assertNotEqual(root.normalized(drift, selection, previous), root.normalized(old, selection, previous))
        web = copy.deepcopy(new)
        web['services']['web']['environment']['BILLING_ENABLED'] = 'true'
        self.assertNotEqual(root.normalized(web, selection, previous), root.normalized(old, selection, previous))

    def test_only_a_billing_preparation_may_carry_the_secrets(self):
        self.chain.admit_readers()
        secrets = {'secretKey': TEST_KEY, 'webhookSecret': WEBHOOK}
        reader = self.system(selection=self.reader_selection(), billingSecrets=secrets)
        with self.assertRaisesRegex(ValueError, 'billing-config preparation'):
            reader.prepare()
        billing = self.system(selection=self.selection(), billingSecrets=secrets)
        self.assertEqual(billing.billing_secrets(), secrets)
        self.assertIsNone(self.system(selection=self.reader_selection()).billing_secrets())

    def test_billing_never_writes_the_database_nor_depends_on_the_window(self):
        self.chain.admit_readers()
        selection = self.selection()
        value = {**self.chain.prepare(3, 'billing-config', selection=selection), 'database': {
            'version': 'alterward-funded-runtime-1', 'schema': 39, 'identityBindingSha256': 'a' * 64,
            'dataSha256': 'b' * 64, 'artifactSha256': 'c' * 64, 'catalogSha256': 'd' * 64,
            'policiesSha256': 'e' * 64, 'drained': True, 'providerApiCalls': 0}}
        self.fixture.write(self.chain.root(3) / 'prepared.json', encoded(value))
        system = self.system('apply', selection=selection, release=value['release'],
                             preparedSha256=daily.digest(encoded(value)))
        system.probe = Mock(return_value=value['database'])
        self.assertEqual(system.apply_accounts(value), {'accountsChanged': False})
        self.assertEqual(system.reconcile_accounts(value)['state'], 'uncommitted')
        self.chain.journal(3, ['apply-intent', 'held', 'database-intent'])
        self.assertEqual(system.reconcile_accounts(value)['state'], 'committed')
        self.assertEqual(system.expected_states(), {'uncommitted'})
        self.assertEqual(system.expected_states(True), {'committed'})
        self.assertFalse(system.database_pending(value))
        system.now.return_value = funded.stamp(self.chain.terms['endsAt']) + dt.timedelta(days=1)
        system.require_future_start(value)
        self.assertFalse(system.is_window())

    def test_the_operation_matches_what_daily_accepts(self):
        self.chain.admit_readers()
        selection = self.selection()
        system = self.system(selection=selection, sourceHashes={'packages/database/src/index.ts': 'd' * 64})
        plan = system.billing_operation()['plan']
        self.assertEqual(set(plan), {'version', 'purpose', 'stage', 'observedAt', 'expiresAt', 'previousTermsSha256',
                                     'selectionSha256', 'allowedChanges', 'allowedChangeHashes'})
        self.assertEqual(plan['allowedChanges'], ['packages/database/src/index.ts'])
        self.assertEqual((plan['purpose'], plan['stage']), ('billing-config', 'sandbox'))
        self.assertEqual(plan['selectionSha256'], daily.successor_canonical_hash(selection))
        self.assertEqual(plan['previousTermsSha256'], daily.successor_canonical_hash(self.chain.terms))

    def test_the_two_selection_validators_and_value_builders_agree(self):
        for stage in ('sandbox', 'live', 'enforce'):
            selection = self.selection(stage)
            daily_value = daily.successor_billing_selection(selection)
            self.assertEqual(daily_value, root.billing_selection(selection))
            key = TEST_KEY if stage == 'sandbox' else LIVE_KEY
            values = root.billing_values(selection, {'PUBLIC_HOST': 'alterward.com'},
                                         {'secretKey': key, 'webhookSecret': WEBHOOK})
            expected = {k: v for k, v in values.items() if k not in {'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'}}
            self.assertEqual(daily.successor_billing_environment(daily_value), expected)
        self.assertEqual(set(root.BILLING_KEYS), set(daily.SUCCESSOR_BILLING_DEFAULTS))
        self.assertEqual(set(root.BILLING_KEYS), set(funded.BILLING_DEFAULTS))


class BillingEngineFreeze(ChainRootBase):
    """The billing-config image may differ from the serving image ONLY in the reviewed pg-pool path."""
    ENGINE = 'packages/ai/src/narrative.ts'
    ALLOWED = 'packages/database/src/index.ts'

    def hashes(self, **changes):
        kept = {self.ENGINE: 'b' * 64, 'apps/api/src/app.ts': 'b' * 64, 'database/migrations/039_x.sql': 'b' * 64,
                'Dockerfile': 'b' * 64}
        return {self.ALLOWED: 'a' * 64, **kept, **changes}

    def system_for(self, selection=None, hashes=None):
        self.chain.admit_readers()
        selection = selection or chained.billing_selection(root.canonical_sha(self.chain.terms))
        system = self.system(selection=selection, sourceHashes=self.hashes() if hashes is None else hashes)
        self.fixture.write(system.root / 'selection.json', encoded(selection))
        return system

    def test_the_allow_list_is_exactly_the_reviewed_pg_pool_path_in_every_copy(self):
        self.assertEqual(funded.BILLING_CONFIG_ALLOWED_CHANGES, (self.ALLOWED,))
        self.assertEqual(daily.SUCCESSOR_BILLING_ALLOWED_CHANGES, funded.BILLING_CONFIG_ALLOWED_CHANGES)
        self.assertIn(self.ALLOWED, funded.SCHEMA_039_ALLOWED_CHANGES)  # already part of the serving image's lineage

    def test_the_freeze_input_excludes_exactly_the_allowed_path(self):
        system = self.system_for()
        frozen = system.billing_frozen_source_hashes()
        self.assertEqual(set(frozen), {self.ENGINE, 'apps/api/src/app.ts', 'database/migrations/039_x.sql', 'Dockerfile'})
        self.assertIn(root.sha(root.encoded(frozen)), system.capability_input_hashes())
        self.assertIn(root.sha(root.encoded(system.frozen_source_hashes())), system.capability_input_hashes())

    def test_the_serving_image_must_match_every_other_source(self):
        system = self.system_for()
        with patch.object(system, 'capability', return_value=Mock(returncode=0)) as capability:
            system.require_engine_freeze('sha256:' + '5' * 64)
        image, sent = capability.call_args.args
        self.assertEqual(sent, system.billing_frozen_source_hashes())
        self.assertNotIn(self.ALLOWED, sent)
        with patch.object(system, 'capability', return_value=Mock(returncode=1)):
            with self.assertRaisesRegex(ValueError, 'engine sources must remain unchanged'):
                system.require_engine_freeze('sha256:' + '5' * 64)

    def test_a_changed_engine_file_is_checked_and_a_changed_allowed_file_is_not(self):
        system = self.system_for()
        frozen = lambda **changes: (system.request.update(sourceHashes=self.hashes(**changes)),
                                    system.billing_frozen_source_hashes())[1]
        base = frozen()
        self.assertNotEqual(frozen(**{self.ENGINE: 'f' * 64}), base)
        self.assertNotEqual(frozen(**{'apps/api/src/app.ts': 'f' * 64}), base)  # not on the billing-config list
        self.assertEqual(frozen(**{self.ALLOWED: 'f' * 64}), base)

    def test_nothing_to_freeze_is_refused(self):
        system = self.system_for(hashes={self.ALLOWED: 'a' * 64})
        with self.assertRaisesRegex(ValueError, 'engine sources must remain unchanged'):
            system.require_engine_freeze('sha256:' + '5' * 64)

    def test_the_plan_records_the_list_and_the_hash_of_the_allowed_path(self):
        system = self.system_for(hashes=self.hashes(**{self.ALLOWED: 'd' * 64}))
        plan = system.billing_operation()['plan']
        self.assertEqual(plan['allowedChanges'], [self.ALLOWED])
        self.assertEqual(plan['allowedChangeHashes'], {self.ALLOWED: 'd' * 64})

    def test_a_missing_or_malformed_bundle_hash_of_the_allowed_path_is_refused(self):
        for hashes in ({}, {self.ALLOWED: None}, {self.ALLOWED: 'xyz'}):
            with self.subTest(hashes=hashes), self.assertRaisesRegex(ValueError, 'bundle hash'):
                self.system_for(hashes=hashes).allowed_change_hashes()

    def test_other_purposes_never_gain_the_allowance(self):
        self.chain.admit_readers()
        selection = self.reader_selection()
        other = self.system(selection=selection, sourceHashes=self.hashes())
        self.fixture.write(other.root / 'selection.json', encoded(selection))
        self.assertIn(self.ALLOWED, other.frozen_source_hashes())
        without_allowed = {p: h for p, h in other.frozen_source_hashes().items() if p != self.ALLOWED}
        self.assertNotIn(root.sha(root.encoded(without_allowed)), other.capability_input_hashes())


if __name__ == '__main__':
    unittest.main()
