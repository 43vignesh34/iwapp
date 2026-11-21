import type { QueryClient } from '@tanstack/react-query';
import {
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
  type RouterHistory,
} from '@tanstack/react-router';
import { meQuery } from './features/auth/api';
import { SignInPage } from './features/auth/SignInPage';
import { MemberPage, MembersPage, ProfilePage, UsersPage } from './features/members/pages';
import { AppLayout } from './features/shell/AppLayout';

interface RouterContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({ component: Outlet });

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-in',
  component: SignInPage,
});

/** Every signed-in page sits under this layout. It checks /me BEFORE rendering anything. */
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  beforeLoad: async ({ context }) => {
    // Uses the cached /me if it's fresh (staleTime in meQuery), otherwise fetches it.
    const me = await context.queryClient.query(meQuery);
    if (!me) throw redirect({ to: '/sign-in' });
    return { me };
  },
  component: AppLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/profile' });
  },
});

const profileRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/profile',
  component: ProfilePage,
});

const membersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/members',
  // Same rule as the menu: no capability, no page. (The API would answer 403 anyway.)
  beforeLoad: ({ context }) => {
    if (!context.me.capabilities.includes('members.view')) throw redirect({ to: '/profile' });
  },
  component: MembersPage,
});

const memberRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/members/$id',
  component: function MemberRouteComponent() {
    const { id } = memberRoute.useParams();
    return <MemberPage id={id} />;
  },
});

const usersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/admin/users',
  beforeLoad: ({ context }) => {
    if (!context.me.capabilities.includes('users.manage')) throw redirect({ to: '/profile' });
  },
  component: UsersPage,
});

const routeTree = rootRoute.addChildren([
  signInRoute,
  appRoute.addChildren([indexRoute, profileRoute, membersRoute, memberRoute, usersRoute]),
]);

export function createAppRouter(queryClient: QueryClient, history?: RouterHistory) {
  return createRouter({ routeTree, context: { queryClient }, history, defaultPreload: 'intent' });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
