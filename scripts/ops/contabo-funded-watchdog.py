"""One-transition death watch, not a scheduler or rollout/retry loop.

A SIGKILL loses the pipe lease. Stop only captured immutable container IDs from
this project, preserving unrelated workloads. During staging restart=no also
keeps an interrupted host reboot closed until a verified durable commit exists.
"""

import json
import os
import select
import signal
import time


def identities(system):
    return [
        {
            'id': v['Id'],
            'image': v['Image'],
            'project': v['Config']['Labels']['com.docker.compose.project'],
            'role': v['Config']['Labels']['com.docker.compose.service'],
        }
        for v in system.roles().values()
    ]


class Watchdog:
    def __init__(self, system, candidate, seconds=900):
        self.system, self.candidate = system, candidate
        original = identities(system)
        read, write = os.pipe()
        parentfd = os.pidfd_open(os.getpid())
        pid = os.fork()
        if pid == 0:
            os.close(write)
            try:
                self.child(read, parentfd, original, seconds)
            except BaseException:
                os._exit(1)
            os._exit(0)
        os.close(read)
        os.close(parentfd)
        self.pipe = os.fdopen(write, 'wb', buffering=0)
        self.pid = pid

    def update(self):
        self.pipe.write(
            (
                json.dumps({'watch': identities(self.system)}, separators=(',', ':'))
                + '\n'
            ).encode()
        )

    def finish(self):
        self.pipe.write(b'{"complete":true}\n')
        self.pipe.close()
        pid, status = os.waitpid(self.pid, 0)
        if pid != self.pid or status != 0:
            raise RuntimeError('Funded transition death-watch failed')

    def child(self, read, parentfd, tracked, seconds):
        from alterward_activation import encoded, sha
        import alterward_upgrade as upgrade
        import alterward_readers as readers

        for number in upgrade.INTERRUPTION_SIGNALS:
            signal.signal(number, signal.SIG_IGN)
        deadline = time.monotonic() + seconds
        buffer = b''
        while True:
            remaining = deadline - time.monotonic()
            ready = select.select([read], [], [], max(0, remaining))[0]
            if not ready:
                # pidfd binds the exact parent, never a recycled PID.
                try:
                    signal.pidfd_send_signal(parentfd, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                break
            data = os.read(read, 4096)
            if not data:
                break
            buffer += data
            if len(buffer) > 16384:
                break
            while b'\n' in buffer:
                line, buffer = buffer.split(b'\n', 1)
                message = json.loads(line)
                if message == {'complete': True}:
                    state = self.system.journal(self.candidate)['states'][-1]['state']
                    if state in {'applied', 'recovered', 'closed'}:
                        return
                    break
                if set(message) != {'watch'} or len(message['watch']) != 3:
                    raise ValueError('Bounded death-watch update required')
                tracked = message['watch']
        # Parent is gone. Persist a new intent before scoped stop, retaining the
        # original interrupted phase in the same hash-chained journal.
        journal_ok = True
        try:
            self.system.record('watchdog-stop-intent', self.candidate)
        except BaseException:
            journal_ok = False
        stopped = True
        for item in tracked:
            value = upgrade.docker('inspect', item['id'], check=False)
            if value.returncode:
                continue  # A recreated original ID cannot restart.
            actual = json.loads(value.stdout)[0]
            labels = actual['Config'].get('Labels', {})
            if (
                actual['Id'] != item['id']
                or actual['Image'] != item['image']
                or labels.get('com.docker.compose.project') != item['project']
                or labels.get('com.docker.compose.service') != item['role']
            ):
                stopped = False
                continue
            result = upgrade.docker(
                'stop', '--time', '30', item['id'], check=False, timeout=45
            )
            after = upgrade.docker('inspect', item['id'], check=False)
            if result.returncode or (
                not after.returncode and json.loads(after.stdout)[0]['State']['Running']
            ):
                stopped = False
        try:
            self.system.record(
                'closed' if stopped else 'stop-unverified', self.candidate
            )
        except BaseException:
            journal_ok = False
        path = self.system.root / 'watchdog.json'
        from alterward_fence import original

        history = json.loads(original(path)) if path.exists() else []
        if not isinstance(history, list) or len(history) >= 8:
            raise ValueError('Bounded interrupted death-watch evidence required')
        history.append(
            {
                'preparedSha256': sha(encoded(self.candidate)),
                'servicesStopped': stopped,
                'journalSha256': sha(original(self.system.root / 'journal.json')),
            }
        )
        readers.update_durable(path, encoded(history))
        if not stopped or not journal_ok:
            raise RuntimeError('Death-watch stop or durable proof incomplete')
