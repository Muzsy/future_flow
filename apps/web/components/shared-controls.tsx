'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { lifeApi, clientErrorMessage } from '../lib/client';
import type { OwnBranch, Social } from '../lib/shared-types';

export const sharedApi = lifeApi;
export function useSharedAction() {
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const active = useRef(false),
    keys = useRef(new Map<string, string>());
  async function run(work: () => Promise<void>) {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setNotice('');
    try {
      await work();
    } catch (e) {
      setNotice(clientErrorMessage(e));
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  async function post<T>(path: string, body: unknown): Promise<T> {
    const signature = JSON.stringify([path, body]);
    let key = keys.current.get(signature);
    if (!key) {
      key = crypto.randomUUID();
      keys.current.set(signature, key);
    }
    return sharedApi<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Idempotency-Key': key },
    });
  }
  return { busy, notice, setNotice, run, post };
}
export function SharedNotice({ notice }: { notice: string }) {
  return notice ? (
    <div className="notice error" role="alert">
      {notice}
    </div>
  ) : null;
}
export function SharingConsent({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="shared-check">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        I agree to share my chosen alias and this group’s common events with its
        members. My private goals, finances and personal timeline stay private.
      </span>
    </label>
  );
}
export function OwnBranchSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (id: string) => void;
  disabled: boolean;
}) {
  const [lives, setLives] = useState<
    { id: string; title: string; root_branch_id: string }[]
  >([]);
  const [lifeId, setLifeId] = useState(''),
    [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let stopped = false;
    void lifeApi<typeof lives>('/lives')
      .then((v) => {
        if (!stopped) setLives(v);
      })
      .catch((e) => {
        if (!stopped) setNotice(clientErrorMessage(e));
      });
    return () => {
      stopped = true;
    };
  }, []);
  useEffect(() => {
    let stopped = false;
    const root = lives.find((l) => l.id === lifeId)?.root_branch_id;
    if (!root) return;
    void lifeApi<{ branches: typeof branches }>(`/branches/${root}`)
      .then((v) => {
        if (!stopped) setBranches(v.branches);
      })
      .catch((e) => {
        if (!stopped) setNotice(clientErrorMessage(e));
      });
    return () => {
      stopped = true;
    };
  }, [lifeId, lives]);
  return (
    <div className="shared-fields">
      <SharedNotice notice={notice} />
      <label>
        Your life
        <select
          value={lifeId}
          disabled={disabled}
          onChange={(e) => {
            setLifeId(e.target.value);
            setBranches([]);
            onChange('');
            setNotice('');
          }}
        >
          <option value="">Choose your own life</option>
          {lives.map((l) => (
            <option key={l.id} value={l.id}>
              {l.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        Your branch
        <select
          value={value}
          disabled={disabled || !branches.length}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Choose a branch</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      {!lives.length && !notice && (
        <p className="subtle">
          Start a personal life before creating or joining a group.
        </p>
      )}
    </div>
  );
}
export async function currentOwnBranch(id: string) {
  return (await lifeApi<{ branch: OwnBranch }>(`/branches/${id}`)).branch;
}
export function SocialProfileForm({
  social,
  saved,
}: {
  social: Social;
  saved: (s: Social) => void;
}) {
  const [handle, setHandle] = useState(social.profile?.handle ?? ''),
    [name, setName] = useState(social.profile?.displayName ?? ''),
    [discoverability, setDiscoverability] = useState(
      social.profile?.discoverability ?? 'private',
    ),
    [consent, setConsent] = useState(false);
  const action = useSharedAction();
  return (
    <form
      className="panel shared-fields"
      onSubmit={(e) => {
        e.preventDefault();
        void action.run(async () => {
          saved(
            await sharedApi<Social>('/social-profile', {
              method: 'PUT',
              body: JSON.stringify({
                handle,
                displayName: name,
                discoverability,
              }),
            }),
          );
          setConsent(false);
        });
      }}
    >
      <h2>Your connection profile</h2>
      <p>
        Choose an alias that you are comfortable sharing. Your account email is
        not shown to group members.
      </p>
      <SharedNotice notice={action.notice} />
      <label>
        Display name
        <input
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
        />
      </label>
      <label>
        Handle
        <input
          required
          minLength={3}
          maxLength={30}
          pattern="[a-z0-9][a-z0-9_]{2,29}"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          autoComplete="off"
        />
        <small>Lowercase letters, numbers and underscores.</small>
      </label>
      <label>
        Profile visibility
        <select
          value={discoverability}
          onChange={(e) =>
            setDiscoverability(e.target.value as typeof discoverability)
          }
        >
          <option value="private">Private</option>
          <option value="link_only">People with your invitation</option>
          {discoverability === 'searchable' && (
            <option value="searchable">
              Searchable (directory not available yet)
            </option>
          )}
        </select>
      </label>
      <label className="shared-check">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span>
          I understand that my chosen alias is shared when I join a group.
        </span>
      </label>
      <button className="primary" disabled={action.busy || !consent}>
        {action.busy ? 'Saving…' : 'Save connection profile'}
      </button>
    </form>
  );
}
export function SharedSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="panel shared-fields">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
