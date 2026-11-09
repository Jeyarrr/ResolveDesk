import type { Config } from './env.js';

const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isAllowedOrigin(
  origin: string | undefined,
  config: Pick<Config, 'NODE_ENV' | 'CLIENT_ORIGIN'>,
) {
  if (!origin) return false;
  if (origin === config.CLIENT_ORIGIN) return true;
  if (config.NODE_ENV !== 'development') return false;
  try {
    const expected = new URL(config.CLIENT_ORIGIN);
    const actual = new URL(origin);
    return (
      actual.origin === origin &&
      loopbackHosts.has(expected.hostname) &&
      loopbackHosts.has(actual.hostname) &&
      actual.protocol === expected.protocol &&
      actual.port === expected.port
    );
  } catch {
    return false;
  }
}
