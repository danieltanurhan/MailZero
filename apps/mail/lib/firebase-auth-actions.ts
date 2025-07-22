import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';

const auth = getAuth();

/** Email+password sign-in. Throws Firebase errors on failure. */
export async function emailPasswordSignIn(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

/** Sign the current user out of Firebase. */
export async function firebaseSignOut() {
  return signOut(auth);
}

/**
 * Simple helper used to replace BetterAuth's social login redirect.
 * Navigates the browser to `/login` (or a provided callback URL).
 */
export function redirectToLogin(callbackURL: string = '/login') {
  window.location.href = callbackURL;
}

// ---------------------------------------------------------------------------
// Minimal stub to keep legacy components compiling after BetterAuth removal.
// ---------------------------------------------------------------------------

export const authClient = {
  /**
   * Previously triggered OAuth re-link flow. For now just navigate to login.
   */
  async linkSocial({ callbackURL }: { provider?: string; callbackURL: string }) {
    redirectToLogin(callbackURL);
    return { ok: true } as const;
  },
  /**
   * Placeholder updateUser – no-op until a real user profile service exists.
   */
  async updateUser(_data: Record<string, any>) {
    return { ok: true } as const;
  },
  /** Phone-number verification stubs (not yet implemented). */
  phoneNumber: {
    async sendOtp(_args: { phoneNumber: string }) {
      return { ok: true } as const;
    },
    async verify(_args: { phoneNumber: string; code: string }) {
      return { error: true } as const;
    },
  },
};

// ---------------------------------------------------------------------------
// Very light stub replacing legacy authProxy for route loaders. It simply reads
// Firebase Auth state on the client side; for server/client loaders we return
// null so pages can redirect or rely on RequireAuth.
// ---------------------------------------------------------------------------

export const authProxy = {
  api: {
    async getSession(): Promise<null> {
      return null;
    },
  },
}; 