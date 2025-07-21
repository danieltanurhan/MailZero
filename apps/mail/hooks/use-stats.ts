import { useTRPC } from '@/providers/query-provider';
import { useQuery } from '@tanstack/react-query';
import { useFirebaseSession as useSession } from '@/lib/useFirebaseSession';

export const useStats = () => {
  const { data: session } = useSession();
  const trpc = useTRPC();

  const statsQuery = useQuery(
    trpc.mail.count.queryOptions(void 0, {
      enabled: !!session?.user.id,
    }),
  );

  return statsQuery;
};
