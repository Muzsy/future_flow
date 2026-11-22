#!/usr/bin/env bash
# One-command Contabo release window (plan 053 C1-C3, plan 054 KP4 first step).
#
# Runs from the operator checkout, after the owner approved this exact release
# and the audit file was written for it. It performs the same steps the manual
# windows did, in the same order, and adds what every window needed by hand:
#   C1  the stale `owner/funded-active-proof-capability` record (state
#       "cleaned", no container) is moved aside under the Daily and activation
#       locks, never deleted;
#   C2  restore and fence wait until the 15-minute `alterward-recovery` run has
#       just finished, with a time limit;
#   C3  a refused fence plan or rehearsal gets one more attempt with a fresh
#       active proof (the known transient plan-encryption/observer refusals).
# Preflight checks run before the service is paused: operator HEAD, audit
# file, green main CI and the server's build/rehearsal evidence.
# Any stop before the image is applied restores the open service.
#
# Usage:
#   bash scripts/contabo-release-window.sh --commit <sha40> --image sha256:<64> \
#     --tag alterward:contabo-<sha12> --build-dir /root/alterward-ops/image-<label> \
#     --label <label> [--capacity N | --free N] [--preflight-only]
#   Without --capacity/--free the wave reopens with its capacity before the
#   window. --free N reopens it with N free places: capacity = admissions used
#   when the wave closes + N. Added places are confirmed with the exact
#   --approve-added the server requires (new capacity - capacity before).
set -uo pipefail

usage() {
  sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-2}"
}
COMMIT='' IMAGE='' TAG='' BUILD_DIR='' LABEL='' CAPACITY='' FREE='' PREFLIGHT_ONLY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --commit) COMMIT=${2:-}; shift 2 ;;
    --image) IMAGE=${2:-}; shift 2 ;;
    --tag) TAG=${2:-}; shift 2 ;;
    --build-dir) BUILD_DIR=${2:-}; shift 2 ;;
    --label) LABEL=${2:-}; shift 2 ;;
    --capacity) CAPACITY=${2:-}; shift 2 ;;
    --free) FREE=${2:-}; shift 2 ;;
    --preflight-only) PREFLIGHT_ONLY=1; shift ;;
    -h|--help) usage 0 ;;
    *) echo "Unknown argument: $1" >&2; usage ;;
  esac
done
[[ $COMMIT =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid --commit' >&2; usage; }
[[ $IMAGE =~ ^sha256:[0-9a-f]{64}$ ]] || { echo 'Invalid --image' >&2; usage; }
[[ $TAG == "alterward:contabo-${COMMIT:0:12}" ]] || { echo 'Invalid --tag' >&2; usage; }
[[ $BUILD_DIR =~ ^/root/alterward-ops/image-[A-Za-z0-9._-]+$ ]] || { echo 'Invalid --build-dir' >&2; usage; }
[[ $LABEL =~ ^[A-Za-z0-9._-]{1,40}$ ]] || { echo 'Invalid --label' >&2; usage; }
[ -z "$CAPACITY" ] || [[ $CAPACITY =~ ^[0-9]{1,4}$ ]] || { echo 'Invalid --capacity' >&2; usage; }
[ -z "$CAPACITY" ] || [ -z "$FREE" ] || { echo 'Use --capacity or --free, not both' >&2; usage; }
[ -z "$FREE" ] || [[ $FREE =~ ^[0-9]{1,3}$ ]] || { echo 'Invalid --free' >&2; usage; }

ROOT=$(git rev-parse --show-toplevel) || exit 2
cd "$ROOT" || exit 2
export ALTERWARD_SSH_SECRETS_DIR=${ALTERWARD_SSH_SECRETS_DIR:-$ROOT/.local/operator-secrets}
LOG="$ROOT/.local/contabo-release/window-$LABEL-$(date -u +%Y%m%dT%H%M%SZ).log"
mkdir -p "$(dirname "$LOG")"
exec > >(tee -a "$LOG") 2>&1
NOISE='warning\|reparsing\|eliminate\|trace-warnings'
say() { echo "[$(date -u +%H:%M:%S)] $*"; }
stop() { say "STOP $*"; exit 1; }

# --- Preflight: nothing below pauses or changes the service. ---------------
say "preflight $LABEL ${COMMIT:0:12}"
[ "$(git rev-parse HEAD)" = "$COMMIT" ] || stop 'operator HEAD is not the release commit'
[ -z "$(git status --porcelain)" ] || stop 'operator checkout is not clean'
AUDIT=.local/contabo-release/fence-transport-audit-proof.json
[ "$(python3 -c "import json;print(json.load(open('$AUDIT'))['sourceCommit'])" 2>/dev/null)" = "$COMMIT" ] ||
  stop 'the audit file is not written for this commit (it needs the owner approval of this release)'
ci=$(curl -fsS "https://api.github.com/repos/Muzsy/future_flow/actions/runs?head_sha=$COMMIT&event=push" |
  python3 -c "import json,sys;rs=[r for r in json.load(sys.stdin)['workflow_runs'] if r['name']=='Verify main'];print(rs[0]['status'],rs[0]['conclusion']) if rs else print('missing')") ||
  stop 'main CI status unavailable'
[ "$ci" = 'completed success' ] || stop "main CI on the release commit is not green ($ci)"
ssh contabo "set -e; D=$BUILD_DIR
  python3 -c \"import json,sys;b=json.load(open('\$D/build-result.json'));sys.exit(b['imageId']!='$IMAGE' or b['sourceCommit']!='$COMMIT')\"
  R=\$(cat \$D/rehearsal-dir.txt); test -s \$R/evidence/image-rehearsal-receipt.json
  docker image inspect $TAG --format '{{.Id}}' | grep -qx '$IMAGE'" ||
  stop 'server build or rehearsal evidence does not match the release'
say 'preflight ok'
[ "$PREFLIGHT_ONLY" = 1 ] && exit 0

# --- Helpers. --------------------------------------------------------------
# C2: wait until the recovery run is inactive and fired less than 5 minutes ago.
wait_recovery() {
  for _ in $(seq 1 60); do
    ssh contabo 'test "$(systemctl show alterward-recovery.service --property=ActiveState --value)" = inactive &&
      [ $(( $(date +%s) - $(date -d "$(systemctl show alterward-recovery.timer --property=LastTriggerUSec --value)" +%s) )) -lt 300 ]' &&
      return 0
    sleep 20
  done
  say 'recovery timer wait exceeded 20 minutes'
  return 1
}
op() {
  local c out
  c=$(node scripts/contabo-service-operator.mjs "$@" 2>&1 | grep -o 'service-operation [0-9a-f]*')
  [ -n "$c" ] || { say "no confirmation phrase for: $*"; return 1; }
  out=$(node scripts/contabo-service-operator.mjs "$@" --confirm "$c" 2>&1 | grep -v -i "$NOISE" | tail -1)
  echo "${out:0:100}"
  grep -q '"ok":true' <<<"$out"
}
daily() {
  local out
  out=$(node scripts/contabo-daily.mjs --"$1" 2>&1 | grep -v -i "$NOISE" | tail -1)
  echo "${out:0:100}"
  grep -q '"ok":true' <<<"$out"
}
restore() {
  for _ in 1 2; do
    wait_recovery || return 1
    daily restore-latest && return 0
  done
  return 1
}
# C3: fresh active proof, plan, rehearsal; one more attempt on refusal.
fence() {
  local p r
  for _ in 1 2; do
    wait_recovery || return 1
    node scripts/contabo-funded-upgrade.mjs --registry-active-proof 2>&1 | grep -v -i "$NOISE" | cut -c1-100
    p=$(node scripts/contabo-fence-operator.mjs --registry-plan 2>&1 | grep -v -i "$NOISE")
    echo "${p:0:100}"
    grep -q '"ok":true' <<<"$p" || continue
    r=$(node scripts/contabo-fence-operator.mjs --registry-rehearsal 2>&1 | grep -v -i "$NOISE")
    echo "${r:0:100}"
    grep -q '"ok":true' <<<"$r" && return 0
  done
  return 1
}
# C1: move a stale cleaned capability record aside under both locks.
isolate_capability() {
  ssh contabo "LABEL='$LABEL' python3 -" <<'PY'
import fcntl, hashlib, json, os, subprocess, sys
from pathlib import Path
ops = Path('/root/alterward-ops')
locks = [open(p, 'rb') for p in (ops / 'daily/job.lock', ops / 'owner/activation.lock')]
for lock in locks:
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
src = ops / 'owner/funded-active-proof-capability'
if not src.exists():
    print('capability: no stale record')
    sys.exit(0)
raw = (src / 'capability.json').read_bytes()
record = json.loads(raw)
if record.get('state') != 'cleaned':
    print(f"capability: state {record.get('state')!r}, not moved")
    sys.exit(1)
running = subprocess.run(
    ['docker', 'ps', '-aq', '--no-trunc', '--filter', f"name=^/{record['name']}$"],
    capture_output=True, text=True, check=True).stdout.split()
if running:
    print('capability: its container still exists, not moved')
    sys.exit(1)
dst = ops / 'diagnostics' / f"{os.environ['LABEL']}-cleaned-capability-{hashlib.sha256(raw).hexdigest()[:12]}"
if dst.exists():
    print('capability: destination exists, not moved')
    sys.exit(1)
os.rename(src, dst)
print('capability: moved aside', record.get('sourceCommit', '')[:7])
PY
}
# The admission policy from a fresh read-only status (plan 054 KP4: the wave
# commands do not return it). Prints "<used> <capacity> <mode>".
service_policy() {
  node scripts/contabo-service-operator.mjs status >/dev/null 2>&1 || return 1
  python3 - <<'PY'
import glob, json, os
files = sorted(glob.glob('.local/contabo-service-operator/*-result.json'), key=os.path.getmtime)
for path in reversed(files):
    record = json.load(open(path))
    if record.get('command') == 'status':
        policy = record['result']['database']['policy']
        print(int(policy['admissionUsed']), int(policy['admissionCapacity']), policy['mode'])
        break
else:
    raise SystemExit(1)
PY
}
DAILY_DISABLED=0
open_service() {
  local used cap mode added
  op resume || say 'WARN resume refused'
  read -r used cap mode <<<"$(service_policy)"
  [[ $cap =~ ^[0-9]+$ ]] || { say 'WARN admission status unreadable'; return 1; }
  [ -n "$CAPACITY" ] || CAPACITY=$BEFORE_CAPACITY
  added=$(( CAPACITY > cap ? CAPACITY - cap : 0 ))
  op wave --capacity "$CAPACITY" --open --approve-added "$added" || say 'WARN wave reopen refused'
  daily monitor || say 'WARN monitor'
  # Daily is reactivated only when this window disabled it.
  if [ "$DAILY_DISABLED" = 1 ]; then daily activate || say 'WARN daily activate'; fi
}
abort() {
  say "STOP $* - restoring the open service"
  open_service
  exit 1
}
# The local recovery sync is pinned to operator files; after the checkout moved
# to this release it must be reinstalled from it (2026-11-18..21 it was not).
refresh_recovery_sync() {
  local inspect
  inspect=$(node scripts/contabo-recovery-sync-timer.mjs --inspect 2>/dev/null | tail -1)
  if grep -q '"pinsCurrent":true' <<<"$inspect"; then say 'recovery sync pins current'; return 0; fi
  ALTERWARD_PYTHON=$(readlink -f "$(command -v python3)") &&
    export ALTERWARD_PYTHON &&
    node scripts/contabo-recovery-sync-timer.mjs --remove >/dev/null &&
    node scripts/contabo-recovery-sync-timer.mjs --install >/dev/null &&
    node scripts/contabo-recovery-sync-timer.mjs --run >/dev/null &&
    say 'recovery sync reinstalled for this release' || say 'WARN recovery sync reinstall failed'
}

# --- Window. ---------------------------------------------------------------
read -r _ BEFORE_CAPACITY _ <<<"$(service_policy)"
[[ $BEFORE_CAPACITY =~ ^[0-9]+$ ]] || stop 'admission status unreadable'
say "pause (wave capacity before: $BEFORE_CAPACITY)"
op pause || stop 'pause refused'
op wave --close || abort 'wave close refused'
if [ -n "$FREE" ]; then
  read -r used _ _ <<<"$(service_policy)"
  [[ $used =~ ^[0-9]+$ ]] || abort 'admission status unreadable'
  CAPACITY=$((used + FREE))
  say "wave capacity after the release: $CAPACITY ($used used + $FREE free)"
fi
daily disable || abort 'daily disable'
DAILY_DISABLED=1
for step in update backup sync; do
  daily "$step" || abort "daily $step"
done
isolate_capability || abort 'capability record'
restore || abort 'restore of the fresh backup'
fence || abort 'fence before apply'

say 'image apply'
ssh contabo "set -e; B=\$(ls -1t /root/alterward-ops/daily/backups | head -1); D=$BUILD_DIR
  R=\$(cat \$D/rehearsal-dir.txt)
  S=\$(python3 -c \"import json;print(json.load(open('\$D/build-result.json'))['sourceDirectory'])\")
  umask 077
  cat > \$D/request.json <<J
{\"version\": \"alterward-service-image-request-1\", \"build\": {\"commit\": \"$COMMIT\", \"imageId\": \"$IMAGE\", \"imageTag\": \"$TAG\", \"sourceDirectory\": \"\$S\"}, \"rehearsalDirectory\": \"\$R/evidence\", \"backupManifestPath\": \"daily/backups/\$B/manifest.json\", \"restoreProofPath\": \"daily/status/registry-restore.json\"}
J
  cd \$S; test -z \"\$(git status --porcelain)\"
  python3 -B scripts/ops/contabo-service-env.py image-plan --request \$D/request.json > \$D/plan.json; chmod 600 \$D/plan.json
  H=\$(python3 -c \"import json;print(json.load(open('\$D/plan.json'))['planSha256'])\")
  C=\$(python3 -c \"import json;print(json.load(open('\$D/plan.json'))['confirm'])\")
  echo \"plan \$H\"
  python3 -B scripts/ops/contabo-service-env.py image-apply --request \$D/request.json --plan-sha256 \$H --confirm \"\$C\" > \$D/apply.json 2>\$D/apply.err
  chmod 600 \$D/apply.*
  python3 -c \"import json;a=json.load(open('\$D/apply.json'));print('applied generation',a.get('generation'),a.get('operationId'),'paid',a.get('paidAiCalls'))\"
  docker ps --format '{{.Names}} {{.Image}} {{.Status}}' | grep alterward-owner" ||
  abort 'image apply (see apply.err in the build directory)'

# After the apply: a backup of the new state, its restore and the fence, then
# the open service. A post-apply warning keeps the service open and is reported.
say 'after apply'
daily backup || say 'WARN post backup'
daily sync || say 'WARN post sync'
restore || say 'WARN post restore'
fence || say 'WARN post fence'
open_service
refresh_recovery_sync
# KP6: release leftovers retention (owner decision D4); the removed names are
# recorded on the host under diagnostics/.
ssh contabo 'python3 - --apply' < scripts/ops/contabo-release-retention.py || say 'WARN retention'
node scripts/contabo-service-operator.mjs status 2>&1 | grep -v -i "$NOISE" | tail -1 | cut -c1-120
say "done; log: $LOG"
