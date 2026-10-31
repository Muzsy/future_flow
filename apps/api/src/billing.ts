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
  createCheckoutSession,
  entitlementOfSubscriptions,
  handleStripeWebhook,
  paidChaptersAvailable,
  tasterChaptersAvailable,
} from '@future-flow/core';
import type { BillingRuntime } from './billing-runtime';

// Stripe billing routes (ADR-010). The runtime (configuration, store, provider,
// account-deletion guard) is in ./billing-runtime and re-exported here.
export * from './billing-runtime';

const unavailable = () =>
  new DomainError('BILLING_UNAVAILABLE', 'Billing is not available.', 404);

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
