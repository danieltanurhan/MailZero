import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';

/** Shape roughly matching BetterAuth's Session object but minimal */
export type FirebaseSession = {
  user: {
    id: string;
    email: string | null;
    name: string | null;
    image?: string | null;
  };
};

/**
 * React hook that mirrors BetterAuth's `useSession()` but reads Firebase Auth
 * state instead.  Components can destructure `{ data, isPending, refetch }`
 * and continue working unchanged.
 */
export function useFirebaseSession() {
  const [data, setData] = useState<FirebaseSession | null>(null);
  const [isPending, setPending] = useState(true);

  // Force-refresh helper so callers like Danger-Zone page can invalidate state
  const refetch = useCallback(async () => {
    const current = auth.currentUser;
    if (!current) {
      setData(null);
      return;
    }
    await current.reload();
    setData({
      user: {
        id: current.uid,
        email: current.email,
        name: current.displayName,
        image: current.photoURL,
      },
    });
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setData({
          user: {
            id: user.uid,
            email: user.email,
            name: user.displayName,
            image: user.photoURL,
          },
        });
      } else {
        setData(null);
      }
      setPending(false);
    });
    return unsub;
  }, []);

  return { data, isPending, refetch } as const;
} 