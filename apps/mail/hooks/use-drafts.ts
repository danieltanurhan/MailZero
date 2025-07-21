import { useTRPC } from '@/providers/query-provider';
import { useQuery } from '@tanstack/react-query';
import { useFirebaseSession as useSession } from '@/lib/useFirebaseSession';

export const useDraft = (id: string | null) => {
  const { data: session } = useSession();
  const trpc = useTRPC();
  const draftQuery = useQuery(
    trpc.drafts.get.queryOptions(
      { id: id! },
      { enabled: !!session?.user.id && !!id, staleTime: 1000 * 60 * 60 },
    ),
  );
  return draftQuery;
};
