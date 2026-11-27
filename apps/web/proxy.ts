import { NextResponse, type NextRequest } from 'next/server';
import {
  createClosedSiteGate,
  createServiceSiteGate,
  publicWebException,
  closedSiteResponseHeaders,
} from '@future-flow/access';
import { isPublicIndexablePath } from './lib/seo';

const service = createServiceSiteGate();
const gate = service.enabled
  ? {
      enabled: true,
      verify: async () => true,
    }
  : createClosedSiteGate();
export async function proxy(request: NextRequest) {
  if (!gate.enabled) return NextResponse.next();
  const headers = closedSiteResponseHeaders;
  if (
    publicWebException(request.method, request.nextUrl.pathname) ||
    (await gate.verify(
      request.headers.get('cf-access-jwt-assertion') ?? undefined,
    ))
  ) {
    const response = NextResponse.next();
    const allowIndexing =
      service.enabled &&
      isPublicIndexablePath(request.method, request.nextUrl.pathname);
    for (const [key, value] of Object.entries(headers)) {
      if (allowIndexing && key === 'X-Robots-Tag') continue;
      response.headers.set(key, value);
    }
    return response;
  }
  return new NextResponse(
    '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>Access required · alterward</title><h1>alterward · access required</h1><p>Access to this site is restricted.</p><p><a href="/account-access">Download or delete your own account data</a></p><p><a href="/privacy-notice">Privacy and contact</a></p></html>',
    {
      status: 403,
      headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' },
    },
  );
}
