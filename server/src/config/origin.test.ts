import { describe, expect, it } from 'vitest';
import { isAllowedOrigin } from './origin.js';

const local = { NODE_ENV: 'development', CLIENT_ORIGIN: 'http://127.0.0.1:5173' } as const;

describe('browser origin checks', () => {
  it.each(['http://127.0.0.1:5173', 'http://localhost:5173', 'http://[::1]:5173'])(
    'accepts the local browser address %s during development',
    (origin) => expect(isAllowedOrigin(origin, local)).toBe(true),
  );
  it.each([
    undefined,
    'null',
    'https://localhost:5173',
    'http://localhost:5174',
    'http://localhost.evil.example:5173',
    'http://192.168.1.2:5173',
    'http://localhost:5173/path',
    'http://user@localhost:5173',
  ])('rejects missing, unrelated, or malformed origins: %s', (origin) => {
    expect(isAllowedOrigin(origin, local)).toBe(false);
  });
  it('keeps production restricted to the exact configured origin', () => {
    const production = {
      NODE_ENV: 'production',
      CLIENT_ORIGIN: 'https://resolvedesk.example',
    } as const;
    expect(isAllowedOrigin('https://resolvedesk.example', production)).toBe(true);
    expect(isAllowedOrigin('http://localhost:5173', production)).toBe(false);
    expect(isAllowedOrigin('https://other.example', production)).toBe(false);
    expect(isAllowedOrigin('http://localhost:5173', { ...local, NODE_ENV: 'production' })).toBe(
      false,
    );
  });
  it('does not add loopback access when development points at a remote origin', () => {
    expect(
      isAllowedOrigin('http://localhost:5173', {
        NODE_ENV: 'development',
        CLIENT_ORIGIN: 'https://resolvedesk.example',
      }),
    ).toBe(false);
  });
});
