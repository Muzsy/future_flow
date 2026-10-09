"""Prepare an origin key and public CSR in the existing private Caddy mount.

No certificate issuance, config/reload, DNS or service activation. Private key
never leaves the server. Existing key/CSR are reused, never overwritten.
"""

import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

from alterward_backup import proxy_container, confined, private_file


def prepare():
    proxy = proxy_container()
    mount = next(m for m in proxy['Mounts'] if m['Destination'] == '/data')
    root = Path(mount['Source'])
    if (mount['Type'] != 'bind' or root.is_symlink() or
            root.resolve() != Path('/root/ghost/caddy_data') or
            proxy['Config']['User'] not in ['', 'root', '0', '0:0']):
        raise ValueError('Unexpected existing proxy certificate mount')
    directory = root / 'alterward-origin'
    confined(root, directory)
    if directory.is_symlink():
        raise ValueError('Linked origin directory')
    directory.mkdir(mode=0o700, exist_ok=True)
    directory.chmod(0o700)
    key, csr = directory / 'origin.key', directory / 'origin.csr'
    for path in [key, csr]:
        if path.is_symlink() or (path.exists() and (not path.is_file() or path.stat().st_nlink != 1)):
            raise ValueError('Invalid existing origin file')
    if not key.exists():
        generated = subprocess.run(['openssl', 'genrsa', '2048'], capture_output=True, check=True)
        private_file(key, generated.stdout)
    key.chmod(0o600)
    if not csr.exists():
        generated = subprocess.run([
            'openssl', 'req', '-new', '-key', str(key), '-subj', '/CN=alterward.com',
            '-addext', 'subjectAltName=DNS:alterward.com,DNS:www.alterward.com',
        ], capture_output=True, check=True)
        private_file(csr, generated.stdout)
    subprocess.run(['openssl', 'req', '-in', str(csr), '-noout', '-verify'],
                   capture_output=True, check=True)
    description = subprocess.run(['openssl', 'req', '-in', str(csr), '-noout', '-text'],
                                 capture_output=True, check=True).stdout.decode()
    names = re.search(r'X509v3 Subject Alternative Name:\s*\n\s*([^\n]+)', description)
    if not names or names[1].strip() != 'DNS:alterward.com, DNS:www.alterward.com':
        raise ValueError('CSR hostnames differ')
    public_key = subprocess.run(['openssl', 'pkey', '-in', str(key), '-pubout', '-outform', 'DER'],
                                capture_output=True, check=True).stdout
    csr_key = subprocess.run(['openssl', 'req', '-in', str(csr), '-noout', '-pubkey'],
                             capture_output=True, check=True).stdout
    csr_der = subprocess.run(['openssl', 'pkey', '-pubin', '-outform', 'DER'], input=csr_key,
                             capture_output=True, check=True).stdout
    if public_key != csr_der:
        raise ValueError('CSR belongs to a different key')
    return {'csr': csr.read_text(), 'publicKeySha256': hashlib.sha256(public_key).hexdigest(),
            'privateKeyExported': False, 'certificateIssued': False, 'proxyChanged': False,
            'dnsChanged': False, 'keyMode': oct(key.stat().st_mode & 0o777)}


if __name__ == '__main__':
    try:
        print(json.dumps({'ok': True, 'result': prepare()}))
    except Exception:
        print(json.dumps({'ok': False, 'phase': 'origin-csr-preparation'}))
        sys.exit(1)
