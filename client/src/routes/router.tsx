import { lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { Authenticated, LazyOutlet, RoleGate } from './guards';
import { LoginPage, ForgotPasswordPage } from '../features/auth/auth-pages';
const Dashboard = lazy(() => import('../features/dashboard/dashboard-page'));
const TicketList = lazy(() => import('../features/tickets/ticket-list-page'));
const TicketDetail = lazy(() => import('../features/tickets/ticket-detail-page'));
const CreateTicket = lazy(() => import('../features/tickets/create-ticket-page'));
const Knowledge = lazy(() =>
  import('../features/knowledge-base/knowledge-pages').then((m) => ({ default: m.KnowledgePage })),
);
const Article = lazy(() =>
  import('../features/knowledge-base/knowledge-pages').then((m) => ({ default: m.ArticlePage })),
);
const Notifications = lazy(() => import('../features/notifications/notifications-page'));
const Team = lazy(() => import('../features/admin/team-page'));
const Reports = lazy(() => import('../features/admin/reports-page'));
const Escalations = lazy(() => import('../features/admin/escalations-page'));
const Settings = lazy(() => import('../pages/settings-page'));
const NotFound = lazy(() => import('../pages/not-found-page'));
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  {
    element: <Authenticated />,
    children: [
      {
        element: <LazyOutlet />,
        children: [
          { index: true, element: <Dashboard /> },
          { path: 'tickets/mine', element: <TicketList key="mine" mine /> },
          { path: 'tickets/new', element: <CreateTicket /> },
          { path: 'tickets/:id', element: <TicketDetail /> },
          {
            element: <RoleGate roles={['agent', 'admin']} />,
            children: [{ path: 'tickets', element: <TicketList key="all" /> }],
          },
          { path: 'knowledge', element: <Knowledge /> },
          { path: 'knowledge/:id', element: <Article /> },
          { path: 'notifications', element: <Notifications /> },
          { path: 'settings', element: <Settings /> },
          {
            element: <RoleGate roles={['admin']} />,
            children: [
              { path: 'team', element: <Team /> },
              { path: 'reports', element: <Reports /> },
              { path: 'escalations', element: <Escalations /> },
            ],
          },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]);
