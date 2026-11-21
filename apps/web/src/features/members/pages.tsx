import { Alert, Button, Card, Group, Loader, Stack, Text, TextInput, Title } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useMe } from '../auth/api';
import { membersListQuery, memberQuery } from './api';
import { MemberProfile } from './MemberProfile';

function LoadError({ error }: { error: Error }) {
  return (
    <Alert color="red" role="alert" title="Could not load">
      {error.message}
    </Alert>
  );
}

/** The member list, scoped by the API to what this user may see. */
export function MembersPage() {
  const [search, setSearch] = useState('');
  const [q] = useDebouncedValue(search.trim(), 300);
  const list = useInfiniteQuery(membersListQuery(q));
  const members = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Stack maw={720}>
      <Title order={2}>Members</Title>
      <TextInput
        label="Search by name"
        placeholder="e.g. Radhika"
        value={search}
        onChange={(e) => {
          setSearch(e.currentTarget.value);
        }}
      />
      {list.isPending && <Loader aria-label="Loading members" />}
      {list.error && <LoadError error={list.error} />}
      {list.isSuccess && members.length === 0 && <Text c="dimmed">No members found.</Text>}
      <Stack gap="xs" component="ul" p={0} style={{ listStyle: 'none' }}>
        {members.map((m) => (
          <li key={m.id}>
            <Link
              to="/members/$id"
              params={{ id: m.id }}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <Card withBorder padding="sm">
                <Group justify="space-between" wrap="nowrap">
                  <div style={{ minWidth: 0 }}>
                    <Text fw={500} truncate>
                      {m.displayName}
                    </Text>
                    <Text size="sm" c="dimmed" truncate>
                      {m.legalName} · {m.locality}
                    </Text>
                  </div>
                  <Text size="xs" c="dimmed" ta="right">
                    {m.bhaktiVriksha ?? 'No BV'}
                  </Text>
                </Group>
              </Card>
            </Link>
          </li>
        ))}
      </Stack>
      {list.hasNextPage && (
        <Button
          variant="light"
          loading={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          Load more
        </Button>
      )}
    </Stack>
  );
}

function MemberById({ id }: { id: string }) {
  const { data: me } = useMe();
  const member = useQuery(memberQuery(id));
  if (member.isPending) return <Loader aria-label="Loading profile" />;
  if (member.error) return <LoadError error={member.error} />;
  // Members edit themselves; admins edit anyone. Leaders wait on Q2. The API enforces this anyway.
  const canEdit = me?.person.id === id || me?.user.isAdmin === true;
  return <MemberProfile member={member.data} canEdit={canEdit} />;
}

export function MemberPage({ id }: { id: string }) {
  return <MemberById id={id} />;
}

export function ProfilePage() {
  const { data: me } = useMe();
  return me ? <MemberById id={me.person.id} /> : null;
}

export function UsersPage() {
  return (
    <Stack maw={560}>
      <Title order={2}>Users</Title>
      <Text c="dimmed">
        Inviting and managing users arrives in M1. The API endpoint exists already.
      </Text>
    </Stack>
  );
}
