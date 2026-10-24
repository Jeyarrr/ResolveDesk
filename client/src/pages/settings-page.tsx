import { NotificationPreferences } from '../features/notifications/notification-center';
import { SlaPolicies } from '../features/tickets/sla';
import { Moon, Sun, ShieldCheck, Server } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useApp } from '../app/context';
import { getHealth } from '../services/api';
import { Card, InlineMessage, PageHeader } from '../components/shared/primitives';
import { Button } from '../components/ui/button';
import { ResponseTemplates } from '../features/admin/response-templates';
export default function SettingsPage() {
  const { user, theme, setTheme } = useApp();
  const health = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    enabled: false,
    retry: false,
  });
  if (!user) return null;
  return (
    <>
      <PageHeader
        eyebrow="MAKE YOURSELF AT HOME"
        title="Profile & settings"
        description="Your account details and workspace preferences."
      />
      <div className="form-layout">
        <div className="space-y-5">
          {user.role !== 'employee' && <ResponseTemplates />}
          <Card title="Your profile" subtitle="Account details are managed by an administrator.">
            <dl className="ticket-properties">
              <div>
                <dt>Name</dt>
                <dd>{user.name}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{user.email}</dd>
              </div>
              <div>
                <dt>Department</dt>
                <dd>{user.department || 'Not assigned'}</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>{user.role}</dd>
              </div>
            </dl>
          </Card>
          <NotificationPreferences />
          {user.role === 'admin' && <SlaPolicies />}
        </div>
        <div className="space-y-5">
          <Card title="Appearance" subtitle="Saved on this device">
            <div className="theme-options">
              {(['dark', 'light'] as const).map((mode) => (
                <button
                  key={mode}
                  className={theme === mode ? 'selected' : ''}
                  aria-pressed={theme === mode}
                  onClick={() => setTheme(mode)}
                >
                  {mode === 'dark' ? <Moon size={22} /> : <Sun size={22} />}
                  <span>{mode === 'dark' ? 'Dark' : 'Light'} mode</span>
                  <div className={'theme-preview theme-preview-' + mode}>
                    <i />
                    <div>
                      <b />
                      <b />
                      <b />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </Card>
          <Card title="Account security">
            <div className="px-6 pb-6">
              <ShieldCheck className="mb-3 text-primary" />
              <p className="text-sm leading-6 text-muted-foreground">
                Your session uses an HttpOnly cookie and expires after 8 hours, or 7 days when
                requested at sign-in. Logging out revokes it on the server. Password recovery and
                multi-factor authentication are not yet available.
              </p>
            </div>
          </Card>
          <Card title="Backend connection">
            <div className="px-6 pb-6">
              <Button
                variant="outline"
                disabled={health.isFetching}
                onClick={() => void health.refetch()}
              >
                <Server />
                {health.isFetching ? 'Checking…' : 'Check API health'}
              </Button>
              {health.data && (
                <p role="status" className="mt-3 text-sm">
                  {health.data.data.service}: {health.data.data.status}
                </p>
              )}
              {health.error && <InlineMessage error>{health.error.message}</InlineMessage>}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
