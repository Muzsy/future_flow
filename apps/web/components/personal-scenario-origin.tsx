'use client';
import { useEffect, useState } from 'react';
import { personalScenarioAttributionSchema } from '@future-flow/contracts';
import { lifeApi } from '../lib/client';
import { useScenarioAccount } from '../lib/scenario-account';
export function PersonalScenarioOrigin({
  lifeId,
  user,
}: {
  lifeId: string;
  user: string;
}) {
  const account = useScenarioAccount(),
    [data, setData] = useState<ReturnType<
      typeof personalScenarioAttributionSchema.parse
    > | null>(null);
  useEffect(() => {
    setData(null);
    if (account.user !== user) return;
    let stopped = false,
      controller: AbortController | null = null;
    const own = account.epoch.current;
    async function read() {
      controller?.abort();
      const abort = new AbortController();
      controller = abort;
      try {
        const next = personalScenarioAttributionSchema.parse(
          await lifeApi(
            `/personal-scenarios/lives/${lifeId}/attribution`,
            { signal: abort.signal },
            user,
          ),
        );
        if (next.lifeId !== lifeId) throw Error('Wrong life');
        if (!stopped && !abort.signal.aborted && account.epoch.current === own)
          setData(next);
      } catch {
        if (!stopped && !abort.signal.aborted && account.epoch.current === own)
          setData(null);
      }
    }
    const refresh = () => {
      if (document.visibilityState === 'visible') void read();
      else {
        controller?.abort();
        setData(null);
      }
    };
    void read();
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      stopped = true;
      controller?.abort();
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [lifeId, user, account.user, account.version]);
  if (account.user !== user || !data) return null;
  return (
    <aside className="notice" aria-label="Scenario origin">
      <p>
        This is your private personalized life, with its own starting facts and
        decisions.
      </p>
      {data.source ? (
        <p>
          Starting theme:{' '}
          <a href={`/scenarios/${data.source.slug}`}>{data.source.title}</a> ·
          Official Scenario
        </p>
      ) : (
        <p>
          The original scenario is no longer available. Your saved life
          continues independently.
        </p>
      )}
    </aside>
  );
}
