import type { MemberDetail } from '@iwapp/shared';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { server } from '../../test/msw';
import { MemberEditForm } from './MemberEditForm';

const member: MemberDetail = {
  id: '0193a000-0000-7000-8000-000000000002',
  legalName: 'Asha Rao',
  displayName: 'Asha',
  locality: 'Hoodi',
  email: null,
  phoneE164: null,
  status: 'active',
  units: [],
  version: 4,
};

function renderForm(onDone = vi.fn()) {
  render(
    <MantineProvider>
      <QueryClientProvider client={new QueryClient()}>
        <MemberEditForm member={member} onDone={onDone} />
      </QueryClientProvider>
    </MantineProvider>,
  );
  return onDone;
}

describe('MemberEditForm', () => {
  it('sends only the changed field, with If-Match set to the version being edited', async () => {
    let sent: { body: unknown; ifMatch: string | null } | undefined;
    server.use(
      http.patch('*/api/v1/members/:id', async ({ request }) => {
        sent = { body: await request.json(), ifMatch: request.headers.get('if-match') };
        return HttpResponse.json({ ...member, phoneE164: '+919876543210', version: 5 });
      }),
      http.get('*/api/v1/members', () => HttpResponse.json({ items: [], nextCursor: null })),
    );
    const onDone = renderForm();
    await userEvent.type(screen.getByLabelText('Phone'), '98765 43210');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => {
      expect(onDone).toHaveBeenCalled();
    });
    expect(sent).toEqual({ body: { phone: '98765 43210' }, ifMatch: '"4"' });
  });

  it('shows a clear message when someone else saved first (412)', async () => {
    server.use(
      http.patch('*/api/v1/members/:id', () =>
        HttpResponse.json(
          {
            type: 'about:blank',
            title: 'Precondition Failed',
            status: 412,
            code: 'VERSION_MISMATCH',
            requestId: 'r',
          },
          { status: 412 },
        ),
      ),
    );
    renderForm();
    await userEvent.clear(screen.getByLabelText('Locality'));
    await userEvent.type(screen.getByLabelText('Locality'), 'Varthur');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Someone else changed this profile');
  });

  it('validates with the shared rules before sending anything', async () => {
    renderForm(); // no PATCH handler: if the form sent a request, MSW would fail the test
    await userEvent.clear(screen.getByLabelText('Display name'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Required')).toBeInTheDocument();
  });
});
