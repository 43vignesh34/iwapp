import { AppShell, Burger, Button, Group, NavLink, Text, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { signOut, useMe } from '../auth/api';
import { navItemsFor } from './nav';

/**
 * The signed-in shell, mobile first (spec §7, A8): at 360 px the menu sits behind a burger;
 * from the "sm" breakpoint up it's a sidebar. Menu items come from /me capabilities.
 */
export function AppLayout() {
  const { data: me } = useMe();
  const [opened, { toggle, close }] = useDisclosure();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = navItemsFor(me?.capabilities ?? []);

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="sm"
              size="sm"
              aria-label="Toggle menu"
            />
            <Title order={1} size="h4" c="saffron.8">
              IWApp
            </Title>
          </Group>
          <Group gap="xs" wrap="nowrap">
            <Text size="sm" visibleFrom="xs" truncate maw={140}>
              {me?.person.displayName}
            </Text>
            <Button
              variant="subtle"
              size="compact-sm"
              onClick={() => {
                void signOut(queryClient).then(() => navigate({ to: '/sign-in' }));
              }}
            >
              Sign out
            </Button>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs" aria-label="Main">
        {items.map((item) => (
          <NavLink
            key={item.to}
            component={Link}
            to={item.to}
            label={item.label}
            active={pathname.startsWith(item.to)}
            onClick={close}
          />
        ))}
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
