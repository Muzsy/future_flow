'use client';
import { useEffect, useState } from 'react';
import {
  publicScenarioSlugSchema,
  scenarioPersonalizationCapabilitySchema,
  type PublicScenarioReader,
} from '@future-flow/contracts';
import { scenarioPublicApi, verifiedScenarioReader } from '../lib/scenario-ui';
import { ScenarioFacts } from './scenario-facts';
import { ScenarioPersonalLauncher } from './scenario-personal-launcher';
export function ScenarioReader({ slug }: { slug: string }) {
  return <Reader key={slug} slug={slug} />;
}
function Reader({ slug }: { slug: string }) {
  const [source, setSource] = useState<PublicScenarioReader | null>(null),
    [enabled, setEnabled] = useState(false),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let stopped = false,
      controller: AbortController | null = null;
    async function read() {
      controller?.abort();
      const abort = new AbortController();
      controller = abort;
      try {
        publicScenarioSlugSchema.parse(slug);
        const next = await verifiedScenarioReader(
          await scenarioPublicApi(`/scenarios/${slug}`, abort.signal),
          slug,
        );
        let canStart = false;
        try {
          const capability = scenarioPersonalizationCapabilitySchema.parse(
            await scenarioPublicApi(
              `/scenario-personalization/${slug}`,
              abort.signal,
            ),
          );
          canStart =
            capability.slug === slug &&
            capability.templateHash === next.templateHash &&
            capability.personalizationEnabled &&
            next.allowPersonalization;
        } catch {
          canStart = false;
        }
        if (!stopped && !abort.signal.aborted) {
          setSource(next);
          setEnabled(canStart);
          setLoading(false);
        }
      } catch {
        if (!stopped && !abort.signal.aborted) {
          setSource(null);
          setEnabled(false);
          setLoading(false);
        }
      }
    }
    const refresh = () => {
      if (document.visibilityState === 'visible') void read();
      else {
        controller?.abort();
        setSource(null);
        setEnabled(false);
      }
    };
    void read();
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      stopped = true;
      controller?.abort();
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [slug]);
  return (
    <main className="shell scenario-page">
      <nav>
        <a href="/">alterward</a> · <a href="/discover">Discover lives</a>
      </nav>
      {source ? (
        <>
          <article className="panel">
            <p>Official Scenario · English</p>
            <h1>{source.template.title}</h1>
            <p>{source.template.summary}</p>
            <p>
              A reviewed fictional starting template. Each life created from it
              develops through its own decisions.
            </p>
            <ScenarioFacts facts={source.template} />
          </article>
          {enabled && <ScenarioPersonalLauncher source={source} />}
        </>
      ) : (
        <section className="panel">
          <h1>
            {loading ? 'Loading scenario…' : 'This scenario is unavailable'}
          </h1>
          {!loading && (
            <p>
              The scenario may have been withdrawn. Explore another starting
              point.
            </p>
          )}
        </section>
      )}
    </main>
  );
}
