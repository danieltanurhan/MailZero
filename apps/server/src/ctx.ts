import type { env } from 'cloudflare:workers';
import type { Autumn } from 'autumn-js';
import type { Auth } from './lib/auth';
// NOTE: We no longer rely exclusively on BetterAuth's user type.
// A minimal shape that works for both Firebase-verified users and BetterAuth users.
export type SessionUser = {
  id: string;
  email: string;
  name?: string;
  image?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

export type HonoVariables = {
  auth?: Auth;
  sessionUser?: SessionUser;
  autumn: Autumn;
};

export type HonoContext = { Variables: HonoVariables; Bindings: typeof env };
