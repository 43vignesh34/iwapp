import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, type RouterHistory } from '@tanstack/react-router';
import { useState } from 'react';
import { ApiError } from './lib/api';
import { createAppRouter } from './router';
import { cssVariablesResolver, theme } from './theme';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Don't retry 4xx (permission, validation): retrying can't change the answer.
        retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
      },
    },
  });
}

/** Providers + router. `history` lets tests start at any URL with an in-memory history. */
export function App({ history }: { history?: RouterHistory }) {
  const [queryClient] = useState(makeQueryClient);
  const [router] = useState(() => createAppRouter(queryClient, history));
  return (
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </MantineProvider>
  );
}
