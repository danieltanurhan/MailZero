import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

export const authProxy = {
  api: {
    getSession: async ({ headers }: { headers: Headers }) => {
      // Check if Firebase user is authenticated
      return new Promise((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
          unsubscribe();
          if (user) {
            resolve({
              user: {
                id: user.uid,
                email: user.email,
                name: user.displayName,
              },
            });
          } else {
            resolve(null);
          }
        });
      });
    },
  },
};
