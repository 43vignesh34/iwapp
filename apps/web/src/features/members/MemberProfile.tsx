import type { MemberDetail } from '@iwapp/shared';
import { Badge, Button, Card, Group, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { MemberEditForm } from './MemberEditForm';

const ROLE_LABEL = { member: 'Member', leader: 'Leader', co_leader: 'Co-leader' } as const;

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase">
        {label}
      </Text>
      <Text>{value ?? '—'}</Text>
    </div>
  );
}

export function MemberProfile({ member, canEdit }: { member: MemberDetail; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  return (
    <Stack maw={560}>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div>
          <Title order={2}>{member.displayName}</Title>
          <Text c="dimmed">{member.legalName}</Text>
        </div>
        {canEdit && !editing && (
          <Button
            variant="light"
            onClick={() => {
              setEditing(true);
            }}
          >
            Edit
          </Button>
        )}
      </Group>
      <Card withBorder>
        {editing ? (
          <MemberEditForm
            member={member}
            onDone={() => {
              setEditing(false);
            }}
          />
        ) : (
          <Stack gap="sm">
            <Field label="Locality" value={member.locality} />
            <Field label="Email" value={member.email} />
            <Field label="Phone" value={member.phoneE164} />
            <Field label="Status" value={member.status} />
          </Stack>
        )}
      </Card>
      <Card withBorder>
        <Title order={3} size="h5" mb="xs">
          Units
        </Title>
        {member.units.length === 0 && <Text c="dimmed">Not in any unit yet.</Text>}
        <Stack gap={6}>
          {member.units.map((u) => (
            <Group key={`${u.id}-${u.role}`} justify="space-between" wrap="nowrap">
              <Text truncate>{u.name}</Text>
              <Badge variant="light">{ROLE_LABEL[u.role]}</Badge>
            </Group>
          ))}
        </Stack>
      </Card>
    </Stack>
  );
}
