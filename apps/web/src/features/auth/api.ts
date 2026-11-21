import { MeResponseSchema, type MeResponse } from '@iwapp/shared';
import { queryOptions, useQuery, type QueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api';

/** Who is signed in, or null. Everything permission-aware in the UI reads this. */
export const meQuery = queryOptions({
  queryKey: ['me'],
  queryFn: async (): Promise<MeResponse | null> => {
    try {
      return await api('/me', { schema: MeResponseSchema });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },
  staleTime: 60_000,
});

export function useMe() {
  return useQuery(meQuery);
}

export async function signInWithTestAccount(queryClient: QueryClient, email: string) {
  await api('/auth/test-login', { method: 'POST', body: { email } });
  await queryClient.invalidateQueries();
}

export async function signInWithGoogle(queryClient: QueryClient, credential: string) {
  await api('/auth/google', { method: 'POST', body: { credential } });
  await queryClient.invalidateQueries();
}

export async function signOut(queryClient: QueryClient) {
  await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
  queryClient.clear();
}
