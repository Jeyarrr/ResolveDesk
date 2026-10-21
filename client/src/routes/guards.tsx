import { Suspense } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useApp } from '../app/context';
import { AppShell } from '../components/layout/app-shell';
import { InlineMessage, Loading } from '../components/shared/primitives';
import type { Role } from '../types/domain';
export function Authenticated() {
  const { user, isLoading, authError, retryAuth } = useApp();
  if (isLoading) return <Loading />;
  if (authError)
    return (
      <div className="p-8">
        <InlineMessage error>
          {authError.message} <button onClick={retryAuth}>Retry connection</button>
        </InlineMessage>
      </div>
    );
  return user ? <AppShell /> : <Navigate to="/login" replace />;
}
export function RoleGate({ roles }: { roles: Role[] }) {
  const { user } = useApp();
  return user && roles.includes(user.role) ? <Outlet /> : <Navigate to="/" replace />;
}
export function LazyOutlet() {
  return (
    <Suspense fallback={<Loading />}>
      <Outlet />
    </Suspense>
  );
}
