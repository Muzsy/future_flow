import type {
  ApplicationAiBudgetConfig,
  ServiceUsdAlert,
} from '@future-flow/database';

// Operator-visible alert line for the service-profile USD protection. It names
// the scope and amounts only: no user id, email or job content. A single
// structured stderr line is what the monitor and the logs pick up.
export function logServiceUsdAlert(
  alert: ServiceUsdAlert,
  write: (line: string) => void = (line) => console.error(line),
) {
  write(
    JSON.stringify({
      event: 'service_usd_alert',
      scope: alert.scope,
      threshold: alert.threshold,
      limitMicroUsd: alert.limitMicro,
      accountedMicroUsd: alert.accountedMicro,
      window: alert.window,
    }),
  );
}

// Only the service profile carries alerts; the legacy budget is left unchanged.
export function withServiceUsdAlerts(
  config: ApplicationAiBudgetConfig,
  write?: (line: string) => void,
): ApplicationAiBudgetConfig {
  return config.serviceProfile === true
    ? { ...config, onAlert: (alert) => logServiceUsdAlert(alert, write) }
    : config;
}
