import { Alert, Button, Center, Divider, Paper, Select, Stack, Text, Title } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { ApiError } from '../../lib/api';
import { signInWithGoogle, signInWithTestAccount } from './api';
import { GoogleButton } from './GoogleButton';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

/** The seeded test accounts (synthetic, @iwapp.test). Only offered in dev and test builds;
 *  the API side only exists when AUTH_TEST_MODE is on, which production refuses. */
const SHOW_TEST_SIGN_IN = import.meta.env.DEV || import.meta.env.VITE_TEST_SIGN_IN === 'true';
const TEST_ACCOUNTS = [
  { value: 'member@iwapp.test', label: 'Member (Dwarka BV)' },
  { value: 'leader@iwapp.test', label: 'BV leader (Dwarka)' },
  { value: 'circle-leader@iwapp.test', label: 'Circle leader (Circle 1.1)' },
  { value: 'other-leader@iwapp.test', label: 'BV leader (Udupi, Sector 2)' },
  { value: 'admin@iwapp.test', label: 'Admin' },
];

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'NOT_INVITED') return 'Ask an admin to invite you.';
    if (error.code === 'ACCOUNT_DISABLED') return 'This account has been disabled.';
    return error.message;
  }
  return 'Sign-in failed. Please try again.';
}

export function SignInPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testEmail, setTestEmail] = useState<string | null>(TEST_ACCOUNTS[0]?.value ?? null);

  const finish = useCallback(
    async (signIn: () => Promise<void>) => {
      setBusy(true);
      setError(null);
      try {
        await signIn();
        await navigate({ to: '/' });
      } catch (e) {
        setError(messageFor(e));
      } finally {
        setBusy(false);
      }
    },
    [navigate],
  );

  const onGoogleCredential = useCallback(
    (credential: string) => void finish(() => signInWithGoogle(queryClient, credential)),
    [finish, queryClient],
  );

  return (
    <Center mih="100dvh" p="md">
      <Paper withBorder shadow="sm" p="xl" w="100%" maw={400}>
        <Stack>
          <Title order={1} size="h2">
            IWApp
          </Title>
          <Text c="dimmed">ISKCON Whitefield congregation</Text>
          {error && (
            <Alert color="red" role="alert" title="Could not sign you in">
              {error}
            </Alert>
          )}
          {GOOGLE_CLIENT_ID ? (
            <GoogleButton clientId={GOOGLE_CLIENT_ID} onCredential={onGoogleCredential} />
          ) : (
            <Text size="sm" c="dimmed">
              Google sign-in isn&apos;t configured here (set VITE_GOOGLE_CLIENT_ID).
            </Text>
          )}
          {SHOW_TEST_SIGN_IN && (
            <>
              <Divider label="Test accounts (development only)" />
              <Select
                label="Sign in as"
                data={TEST_ACCOUNTS}
                value={testEmail}
                onChange={setTestEmail}
                allowDeselect={false}
              />
              <Button
                loading={busy}
                onClick={() => {
                  if (testEmail) void finish(() => signInWithTestAccount(queryClient, testEmail));
                }}
              >
                Sign in
              </Button>
            </>
          )}
        </Stack>
      </Paper>
    </Center>
  );
}
