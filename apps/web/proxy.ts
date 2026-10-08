import { NextResponse, type NextRequest } from 'next/server';
import {
  createClosedSiteGate,
  publicWebException,
  closedSiteResponseHeaders,
} from '@future-flow/access';

const gate = createClosedSiteGate();
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
    for (const [key, value] of Object.entries(headers))
      response.headers.set(key, value);
    return response;
  }
  return new NextResponse(
    '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>Private beta · alterward</title><h1>alterward is in private beta</h1><p>Access is by invitation.</p><p><a href="/account-access">Download or delete your own account data</a></p><p><a href="/privacy-notice">Privacy and contact</a></p></html>',
    {
      status: 403,
      headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' },
    },
  );
}
