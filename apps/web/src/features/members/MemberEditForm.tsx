import { UpdateMemberBodySchema, type MemberDetail } from '@iwapp/shared';
import { Alert, Button, Group, Stack, TextInput } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiError } from '../../lib/api';
import { zodResolver } from '../../lib/zod-resolver';
import { memberKeys, updateMember } from './api';

/** What the form holds: plain strings, '' meaning "empty". Converted to the API's body below. */
const FormSchema = z.object({
  displayName: z.string().trim().min(1, 'Required').max(100),
  locality: z.string().trim().min(1, 'Required').max(100),
  email: z.union([z.literal(''), z.email('Enter a valid email')]),
  phone: z.union([z.literal(''), z.string().trim().min(7, 'Too short').max(25)]),
});
type FormValues = z.infer<typeof FormSchema>;

/**
 * Journey 5: a member corrects their own details. Sends only the fields that changed, with
 * If-Match, so a concurrent edit is reported (412) instead of silently overwritten.
 */
export function MemberEditForm({ member, onDone }: { member: MemberDetail; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [conflict, setConflict] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      displayName: member.displayName,
      locality: member.locality,
      email: member.email ?? '',
      phone: member.phoneE164 ?? '',
    },
  });
  const { errors, isSubmitting, dirtyFields } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setConflict(false);
    const changes: Record<string, string | null> = {};
    for (const key of Object.keys(dirtyFields) as (keyof FormValues)[]) {
      changes[key] = values[key] === '' ? null : values[key];
    }
    const body = UpdateMemberBodySchema.safeParse(changes);
    if (!body.success) {
      onDone(); // nothing changed
      return;
    }
    try {
      await updateMember(queryClient, member, body.data);
      onDone();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'VERSION_MISMATCH') setConflict(true);
      else if (error instanceof ApiError && error.code === 'INVALID_PHONE')
        form.setError('phone', { message: error.message });
      else
        form.setError('root', { message: error instanceof Error ? error.message : 'Save failed' });
    }
  });

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate>
      <Stack>
        {conflict && (
          <Alert color="yellow" title="Someone else changed this profile" role="alert">
            Your changes were not saved.{' '}
            <Button
              variant="subtle"
              size="compact-sm"
              onClick={() =>
                void queryClient
                  .invalidateQueries({ queryKey: memberKeys.detail(member.id) })
                  .then(onDone)
              }
            >
              Load the latest version
            </Button>
          </Alert>
        )}
        {errors.root && (
          <Alert color="red" role="alert">
            {errors.root.message}
          </Alert>
        )}
        <TextInput
          label="Display name"
          {...form.register('displayName')}
          error={errors.displayName?.message}
        />
        <TextInput
          label="Locality"
          {...form.register('locality')}
          error={errors.locality?.message}
        />
        <TextInput
          label="Email"
          type="email"
          autoComplete="email"
          {...form.register('email')}
          error={errors.email?.message}
        />
        <TextInput
          label="Phone"
          type="tel"
          autoComplete="tel"
          description="Any format, e.g. 98765 43210"
          {...form.register('phone')}
          error={errors.phone?.message}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting}>
            Save
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
