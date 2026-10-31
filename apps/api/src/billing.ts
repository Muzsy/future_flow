import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Res,
  Inject,
  UseGuards,
  type Type,
  type CanActivate,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  DomainError,
  cancelProviderSubscriptionsForUser,
  createCheckoutSession,
  createStripeProvider,
  entitlementOfSubscriptions,
  handleStripeWebhook,
  paidChaptersAvailable,
  tasterChaptersAvailable,
  billingConfigFromEnv,
  redactBillingConfig,
  type BillingAlert,
  type BillingEnvConfig,
  type BillingProvider,
  type BillingStore,
} from '@future-flow/core';
import {
  createBillingStore,
  hasLiveBillingSubscription,
  type Database,
} from '@future-flow/database';
import type { AccountDeletionBilling } from './account-deletion';

// Stripe billing surface (ADR-010). Nothing here is reachable unless billing is
// explicitly and completely configured (BILLING_ENABLED=true plus valid keys):
// otherwise the routes answer 404 and the application behaves exactly as before.

export type BillingRuntime = Readonly<{
  config: BillingEnvConfig;
  store: BillingStore;
  provider: BillingProvider | null;
  db: Database;
  alert: (alert: BillingAlert) => void;
  now: () => Date;
}>;

// Alerts carry only event ids and types, never customer data. One line per kind
// per minute, with the suppressed count, so a hostile sender cannot flood logs.
export function createBillingAlertSink(
  write: (line: string) => void = (line) => console.warn(line),
  clock: () => number = Date.now,
  windowMs = 60_000,
) {
  const last = new Map<string, { at: number; suppressed: number }>();
  return (alert: BillingAlert) => {
    const t = clock();
    const state = last.get(alert.kind);
    if (state && t - state.at < windowMs) {
      state.suppressed++;
      return;
    }
    write(
      JSON.stringify({
        billingAlert: alert.kind,
        ...(alert.eventId ? { eventId: alert.eventId } : {}),
        ...(alert.eventType ? { eventType: alert.eventType } : {}),
        suppressed: state?.suppressed ?? 0,
      }),
    );
    last.set(alert.kind, { at: t, suppressed: 0 });
  };
}

export function createBillingRuntime(
  db: Database,
  config: BillingEnvConfig = billingConfigFromEnv(),
  options: {
    provider?: BillingProvider;
    fetch?: typeof fetch;
    alert?: (alert: BillingAlert) => void;
    now?: () => Date;
  } = {},
): BillingRuntime {
  const provider = !config.enabled
    ? null
    : (options.provider ??
      createStripeProvider({
        secretKey: config.secretKey,
        apiVersion: config.apiVersion,
        priceId: config.priceId,
        couponId: config.couponId,
        successUrl: config.successUrl,
        cancelUrl: config.cancelUrl,
        fetch: options.fetch ?? fetch,
      }));
  return {
    config,
    store: createBillingStore(db),
    provider,
    db,
    alert: options.alert ?? createBillingAlertSink(),
    now: options.now ?? (() => new Date()),
  };
}

// One line at startup, no secrets.
export const describeBilling = (runtime: BillingRuntime) =>
  JSON.stringify({ billing: redactBillingConfig(runtime.config) });

const unavailable = () =>
  new DomainError('BILLING_UNAVAILABLE', 'Billing is not available.', 404);

// Account deletion must never leave a charging subscription behind. With billing
// enabled the provider subscriptions are cancelled first. With billing off or
// misconfigured the deletion proceeds only when the account has no subscription
// that could still be charging; otherwise it stays pending (fail closed).
export function accountDeletionBilling(
  runtime: BillingRuntime,
): AccountDeletionBilling {
  return {
    cancelSubscriptions: async (userId) => {
      if (runtime.provider)
        return cancelProviderSubscriptionsForUser(
          runtime.store,
          runtime.provider,
          userId,
        );
      if (await hasLiveBillingSubscription(runtime.db, userId))
        throw new DomainError(
          'BILLING_CANCELLATION_UNAVAILABLE',
          'The subscription cannot be cancelled while billing is unavailable.',
          503,
        );
      return { cancelled: 0 };
    },
  };
}

export const BILLING_WEBHOOK_PATH = '/api/v1/billing/webhook';
export const BILLING_WEBHOOK_LIMIT = '256kb';

export function createBillingController(
  guard: Type<CanActivate>,
  runtime: BillingRuntime,
): Type {
  @Controller('api/v1/billing')
  class BillingController {
    @UseGuards(guard)
    @ApiBearerAuth()
    @Post('checkout')
    async checkout(@Req() req: { userId: string }, @Body() body: unknown) {
      z.object({})
        .strict()
        .parse(body ?? {});
      if (!runtime.config.enabled || !runtime.provider) throw unavailable();
      return createCheckoutSession(req.userId, runtime.now(), {
        store: runtime.store,
        provider: runtime.provider,
        config: runtime.config,
      });
    }

    @UseGuards(guard)
    @ApiBearerAuth()
    @Get('status')
    async status(@Req() req: { userId: string }) {
      if (!runtime.config.enabled) throw unavailable();
      const now = runtime.now();
      const { subs, ledger } = await runtime.store.transaction(async (tx) => ({
        subs: await tx.listSubscriptions(req.userId),
        ledger: await tx.loadLedger(req.userId),
      }));
      const entitlement = entitlementOfSubscriptions(
        subs,
        now,
        runtime.config.entitlement,
      );
      return {
        state: entitlement.state,
        canGenerate: entitlement.canGenerate,
        paidChaptersAvailable: paidChaptersAvailable(ledger, now),
        tasterChaptersAvailable: tasterChaptersAvailable(ledger),
      };
    }

    // Not authenticated by bearer: the Stripe signature over the raw body is the
    // only credential and is verified before the body is parsed. The raw body
    // middleware is mounted in createApp ahead of the JSON parser.
    @Post('webhook')
    async webhook(
      @Req() request: Request,
      @Res() response: Response,
    ): Promise<void> {
      const config = runtime.config;
      if (!config.enabled || !runtime.provider) throw unavailable();
      const header = request.headers['stripe-signature'];
      const body: unknown = request.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        response.status(400).json({ code: 'invalid_request' });
        return;
      }
      const result = await handleStripeWebhook(
        {
          rawBody: body,
          signatureHeader: typeof header === 'string' ? header : undefined,
          nowSeconds: Math.floor(runtime.now().getTime() / 1000),
          webhookSecret: config.webhookSecret,
          priceId: config.priceId,
          expectedLivemode: /^(sk|rk)_live_/.test(config.secretKey),
          expectedApiVersion: config.apiVersion,
        },
        {
          store: runtime.store,
          provider: runtime.provider,
          offer: config.offer,
          entitlement: config.entitlement,
          designatedUserIds: config.designatedUserIds,
          alert: runtime.alert,
        },
      );
      response.status(result.status).json({ code: result.code });
    }
  }
  return BillingController;
}
