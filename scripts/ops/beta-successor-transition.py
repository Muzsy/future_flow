"""Successor host sequencing, shared by the root adapter and fault tests.

No CLI, SSH, SQL, provider or default system adapter: this alone cannot close a
window. The adapter must own source/authority/access checks, both operator locks,
durable candidate/journal, writer watchdog and exact backup/restore validation.
"""


def transition(system, candidate, *, recovery=False):
    # Invalid/replayed/expired/foreign candidates must fail before any stop or
    # journal mutation. Recovery must also authenticate the original intent.
    system.preflight(candidate, recovery=recovery)
    system.begin_guard(candidate)
    try:
        system.record('recovery-intent' if recovery else 'apply-intent', candidate)
        system.stop_and_hold(candidate)
        system.verify_drained(candidate)
        system.record('held', candidate)
        system.require_candidate_restore(candidate)
        if not recovery:
            system.record('database-intent', candidate)
            system.apply_accounts(candidate)
        # Always observe the committed state independently. Lost COMMIT output
        # is reconciled on explicit recovery; SQL is NEVER repeated by recovery.
        result = system.reconcile_accounts(candidate)
        if result.get('state') != 'committed':
            raise ValueError('Committed unused successor accounts required; keep held')
        system.record('accounts-committed', candidate)
        system.stage_authority(candidate)
        system.verify_staged(candidate)
        system.record('authority-staged', candidate)
        system.require_future_start(candidate)
        system.record('exposure-intent', candidate)
        system.expose(candidate)
        system.verify_serving(candidate)
        system.record('recovered' if recovery else 'applied', candidate)
        system.restore_restart_policy()
        system.finish_guard()
        # A funded owner runtime is NOT a successful browser journey and must
        # never itself be used to declare the tester phase open.
        return {'accountsCommitted': True, 'authorityExposed': True,
                'browserJourneyPassed': False, 'paidAiCalls': 0}
    except BaseException as original:
        try:
            system.stop_and_hold(candidate)
        except BaseException as stop_error:
            try:
                system.record('stop-unverified', candidate)
            except BaseException:
                pass
            raise original from stop_error
        try:
            system.record('held-after-failure', candidate)
            system.record('closed', candidate)
            system.finish_guard()
        except BaseException as journal_error:
            raise original from journal_error
        raise
