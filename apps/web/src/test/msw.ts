import type { Capability, MeResponse } from '@iwapp/shared';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

/** MSW intercepts fetch at the network layer, so components run their real API code. */
export const server = setupServer();

export function meAs(
  capabilities: Capability[],
  overrides: Partial<MeResponse['user']> = {},
): MeResponse {
  return {
    user: {
      id: '0193a000-0000-7000-8000-000000000001',
      email: 'someone@iwapp.test',
      isAdmin: false,
      ...overrides,
    },
    person: { id: '0193a000-0000-7000-8000-000000000002', displayName: 'Asha' },
    capabilities,
  };
}

export const handlers = {
  me: (me: MeResponse | null) =>
    http.get('*/api/v1/me', () =>
      me
        ? HttpResponse.json(me)
        : HttpResponse.json(
            {
              type: 'about:blank',
              title: 'Unauthorized',
              status: 401,
              code: 'UNAUTHENTICATED',
              requestId: 'r',
            },
            { status: 401 },
          ),
    ),
  refreshFails: () =>
    http.post('*/api/v1/auth/refresh', () => new HttpResponse(null, { status: 401 })),
  member: () =>
    http.get('*/api/v1/members/:id', ({ params }) =>
      HttpResponse.json({
        id: params.id,
        legalName: 'Asha Rao',
        displayName: 'Asha',
        locality: 'Hoodi',
        email: null,
        phoneE164: null,
        status: 'active',
        units: [],
        version: 1,
      }),
    ),
};
