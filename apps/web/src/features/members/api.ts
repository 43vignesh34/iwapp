import {
  MemberDetailSchema,
  MemberListResponseSchema,
  type MemberDetail,
  type UpdateMemberBody,
} from '@iwapp/shared';
import { infiniteQueryOptions, queryOptions, type QueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

/** Server state lives in TanStack Query (spec §7). Query keys name what's cached. */
export const memberKeys = {
  all: ['members'] as const,
  list: (q: string) => ['members', 'list', q] as const,
  detail: (id: string) => ['members', 'detail', id] as const,
};

export const membersListQuery = (q: string) =>
  infiniteQueryOptions({
    queryKey: memberKeys.list(q),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '30' });
      if (q) params.set('q', q);
      if (pageParam) params.set('cursor', pageParam);
      return api(`/members?${params.toString()}`, { schema: MemberListResponseSchema });
    },
    getNextPageParam: (last) => last.nextCursor,
  });

export const memberQuery = (id: string) =>
  queryOptions({
    queryKey: memberKeys.detail(id),
    queryFn: () => api(`/members/${id}`, { schema: MemberDetailSchema }),
  });

export async function updateMember(
  queryClient: QueryClient,
  member: MemberDetail,
  changes: UpdateMemberBody,
): Promise<MemberDetail> {
  const updated = await api(`/members/${member.id}`, {
    method: 'PATCH',
    body: changes,
    ifMatch: member.version, // optimistic locking: "I'm editing version N"
    schema: MemberDetailSchema,
  });
  queryClient.setQueryData(memberKeys.detail(member.id), updated);
  await queryClient.invalidateQueries({ queryKey: [...memberKeys.all, 'list'] });
  return updated;
}
