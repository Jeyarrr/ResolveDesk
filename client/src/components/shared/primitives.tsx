import { Inbox, LoaderCircle, ArrowUpRight, LifeBuoy } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn, initials } from '../../lib/utils';
import type { User } from '../../types/domain';
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <LifeBuoy size={22} strokeWidth={2.4} />
      </span>
      {!compact && (
        <span className="text-xl font-bold tracking-[-.7px]">
          Resolve<span className="font-medium text-muted-foreground">Desk</span>
          <span className="text-primary">.</span>
        </span>
      )}
    </div>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
export function Card({
  children,
  className,
  title,
  subtitle,
  action,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <section className={cn('card', className)}>
      {title && (
        <div className="card-heading">
          <div>
            <h2>{title}</h2>
            {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Badge({ value, subtle = false }: { value: string; subtle?: boolean }) {
  return (
    <span
      className={cn(
        'badge',
        `badge-${value.toLowerCase().replace(/\s+/g, '-')}`,
        subtle && 'badge-subtle',
      )}
    >
      <span className="badge-dot" />
      {value}
    </span>
  );
}
export function Avatar({
  user,
  size = 'sm',
}: {
  user?: Pick<User, 'name' | 'initials'>;
  size?: 'sm' | 'lg';
}) {
  return (
    <span
      className={cn('avatar', size === 'lg' && 'avatar-lg')}
      title={user?.name ?? 'Unassigned'}
      aria-hidden="true"
    >
      {user ? initials(user.name) : '—'}
    </span>
  );
}
export function EmptyState({
  title = 'Nothing here yet',
  description,
  action,
}: {
  title?: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="mb-3 rounded-xl bg-accent p-3">
        <Inbox size={24} />
      </span>
      <h3 className="font-semibold text-foreground">{title}</h3>
      <p className="mt-1 max-w-sm text-sm">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
export function Loading({ label = 'Loading your workspace…' }: { label?: string }) {
  return (
    <div
      className="flex min-h-52 items-center justify-center gap-3 text-sm text-muted-foreground"
      role="status"
    >
      <LoaderCircle className="motion-safe:animate-spin" size={18} />
      {label}
    </div>
  );
}
export function InlineMessage({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div className={cn('notice', error && 'notice-error')} role={error ? 'alert' : 'status'}>
      {children}
    </div>
  );
}
export function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="text-link">
      {children}
      <ArrowUpRight size={14} />
    </Link>
  );
}
export function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="mt-1 text-xs text-red-500" role="alert">
      {message}
    </p>
  ) : null;
}
