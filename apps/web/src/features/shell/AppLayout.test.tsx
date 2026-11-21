import { createMemoryHistory } from '@tanstack/react-router';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../../App';
import { handlers, meAs, server } from '../../test/msw';

function renderAt(path: string) {
  return render(<App history={createMemoryHistory({ initialEntries: [path] })} />);
}

describe('the app shell', () => {
  it('sends a signed-out visitor to the sign-in page', async () => {
    server.use(handlers.me(null), handlers.refreshFails());
    renderAt('/profile');
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('builds the menu from /me capabilities: a member gets only "My profile"', async () => {
    server.use(handlers.me(meAs(['profile.view'])), handlers.member());
    renderAt('/profile');
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['My profile']);
    expect(await screen.findByRole('heading', { name: 'Asha' })).toBeInTheDocument();
  });

  it('an admin gets Members and Users too', async () => {
    server.use(
      handlers.me(
        meAs(['profile.view', 'members.view', 'members.create', 'users.manage', 'audit.view'], {
          isAdmin: true,
        }),
      ),
      handlers.member(),
    );
    renderAt('/profile');
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['My profile', 'Members', 'Users']);
  });

  it('a member who types /members into the address bar is sent to their profile', async () => {
    server.use(handlers.me(meAs(['profile.view'])), handlers.member());
    renderAt('/members');
    expect(await screen.findByRole('heading', { name: 'Asha' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Members' })).not.toBeInTheDocument();
  });
});
