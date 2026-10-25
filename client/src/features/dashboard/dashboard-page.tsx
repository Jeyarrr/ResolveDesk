import { SlaDashboard } from '../tickets/sla';
import { NotificationList } from '../notifications/notification-center';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowUpRight,
  Ticket,
  CircleDot,
  CheckCheck,
  Users,
  ShieldCheck,
  AlertTriangle,
  Plus,
  BookOpen,
  Activity,
  CalendarDays,
} from 'lucide-react';
import { useApp } from '../../app/context';
import { useApi } from '../../hooks/use-api';
import type { SlaOverview } from '../../services/operations-contracts';
import { formatDate } from '../../lib/utils';
import { articles } from '../../data/seed';
import {
  displayTicket,
  ticketPeople,
  statusLabels,
  priorityLabels,
  type Analytics,
} from '../../services/contracts';
import { Button } from '../../components/ui/button';
import { MetricCard } from '../../components/shared/metric-card';
import { Card, PageHeader, TextLink, EmptyState } from '../../components/shared/primitives';
import { QueryState } from '../../components/shared/query-state';
import { TicketTable } from '../tickets/ticket-table';
import { DistributionChart, PerformanceChart, VolumeChart } from './charts';
export default function DashboardPage() {
  const { user } = useApp();
  const [days, setDays] = useState(14);
  const query = useApi<Analytics>('/analytics/dashboard?days=' + days);
  const sla = useApi<SlaOverview>('/sla/overview');
  if (!user || !query.data) return <QueryState query={query} />;
  const d = query.data,
    admin = user.role === 'admin',
    agent = user.role === 'agent';
  const count = (name: string) => d.status.find((s) => s.name === name)?.value ?? 0;
  const stats = [
    {
      label: admin ? 'Total tickets' : agent ? 'Assigned tickets' : 'My total tickets',
      value: d.total,
      note: admin ? 'Across your organization' : 'Your support workspace',
      icon: Ticket,
      history: user.role === 'employee' ? undefined : d.series.map((v) => v.received),
      historyLabel: `Tickets received over the last ${days} days`,
    },
    {
      label: admin ? 'Open tickets' : agent ? 'Critical tickets' : 'Active requests',
      value: admin
        ? count('open')
        : agent
          ? (d.priority.find((v) => v.name === 'critical')?.value ?? 0)
          : count('open') + count('in_progress') + count('pending'),
      note: agent ? 'Critical priority requests' : 'Ready for attention',
      icon: CircleDot,
      tone: 'amber',
    },
    {
      label: agent ? 'Pending tickets' : 'In progress',
      value: count(agent ? 'pending' : 'in_progress'),
      note: 'Moving toward a resolution',
      icon: Activity,
      tone: 'sky',
    },
    {
      label: 'Resolved tickets',
      value: count('resolved') + count('closed'),
      note: 'Resolved and closed requests',
      icon: CheckCheck,
      tone: 'green',
      history: user.role === 'employee' ? undefined : d.series.map((v) => v.resolved),
      historyLabel: `Tickets resolved over the last ${days} days`,
    },
    ...(admin
      ? [
          {
            label: 'Active support agents',
            value: d.activeAgents ?? 0,
            note: 'Active agent accounts',
            icon: Users,
          },
          {
            label: 'SLA compliance',
            value: sla.data?.compliance == null ? '—' : sla.data.compliance.toFixed(1) + '%',
            note: sla.data
              ? 'Completed cycles · both targets'
              : sla.isError
                ? 'SLA unavailable'
                : 'Loading SLA measurements',
            icon: ShieldCheck,
            tone: 'sky',
          },
          {
            label: 'Critical tickets',
            value: d.priority.find((v) => v.name === 'critical')?.value ?? 0,
            note: 'Critical priority requests',
            icon: AlertTriangle,
            tone: 'amber',
          },
        ]
      : []),
  ];
  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <PageHeader
        eyebrow={
          admin
            ? 'SUPPORT OPERATIONS'
            : agent
              ? 'YOUR SUPPORT WORKSPACE'
              : 'YOUR IT SUPPORT, SIMPLIFIED'
        }
        title={'Welcome back, ' + user.name.split(' ')[0]}
        description={
          admin
            ? "Here's what's happening with your support team."
            : 'Your requests, priorities, and next steps in one place.'
        }
        actions={
          <>
            <span className="date-chip">
              <CalendarDays size={15} />
              {new Date().toLocaleDateString('en', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
            {!agent && (
              <Button asChild>
                <Link to="/tickets/new">
                  <Plus />
                  Create ticket
                </Link>
              </Button>
            )}
          </>
        }
      />
      <QueryState query={query} />
      <div className={'metrics-grid ' + (admin ? 'metrics-operations' : '')}>
        {stats.map((s) => (
          <MetricCard key={s.label} {...s} />
        ))}
      </div>
      <div className="dashboard-chart-grid">
        {user.role !== 'employee' ? (
          <Card
            title="Ticket volume"
            subtitle="Received and resolved requests · UTC dates"
            action={
              <select
                aria-label="Dashboard chart date range"
                className="select select-small"
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              >
                {[7, 14, 30].map((n) => (
                  <option key={n} value={n}>
                    Last {n} days
                  </option>
                ))}
              </select>
            }
          >
            <div className="chart-legend">
              <span>
                <i style={{ background: 'var(--chart-violet)' }} />
                Received
              </span>
              <span>
                <i style={{ background: 'var(--chart-green)' }} />
                Resolved
              </span>
            </div>
            <VolumeChart series={d.series} days={days} />
          </Card>
        ) : (
          <Card title="A good place to start" subtitle="Get the support you need.">
            <div className="quick-action-grid">
              <Link to="/tickets/new">
                <span className="quick-icon">
                  <Plus />
                </span>
                <h3>Create a support ticket</h3>
                <p>Tell us what's getting in your way.</p>
                <ArrowUpRight size={18} />
              </Link>
              <Link to="/knowledge">
                <span className="quick-icon">
                  <BookOpen />
                </span>
                <h3>Find an answer</h3>
                <p>Explore our sample support guides.</p>
                <ArrowUpRight size={18} />
              </Link>
            </div>
          </Card>
        )}
        <Card
          title={agent ? 'Priority breakdown' : 'Ticket status'}
          subtitle="Calculated from your accessible tickets"
        >
          <DistributionChart
            counts={
              agent
                ? d.priority.map((v) => ({ ...v, name: priorityLabels[v.name] }))
                : d.status.map((v) => ({ ...v, name: statusLabels[v.name] }))
            }
          />
        </Card>
      </div>
      <SlaDashboard />
      <Card
        className="mt-5 overflow-hidden"
        title={agent ? 'Assigned ticket queue' : 'Recent tickets'}
        subtitle="Pick up where you left off"
        action={<TextLink to={admin ? '/tickets' : '/tickets/mine'}>View all tickets</TextLink>}
      >
        <TicketTable tickets={d.recent.map(displayTicket)} users={ticketPeople(d.recent)} compact />
      </Card>
      <div className="dashboard-bottom-grid">
        <Card title="Recent activity" subtitle="Saved updates from tickets you can access">
          <div className="px-5 pb-3">
            {d.recentActivity.map((a) => (
              <Link key={a.id} to={'/tickets/' + a.ticketId} className="activity-row">
                <span className="activity-symbol">
                  <Activity size={16} />
                </span>
                <div>
                  <strong>
                    {a.actorName}
                    <span> · RD-{a.ticketNumber}</span>
                  </strong>
                  <p>{a.action}</p>
                  <time>{formatDate(a.createdAt, true)}</time>
                </div>
              </Link>
            ))}
            {!d.recentActivity.length && (
              <EmptyState description="Ticket activity will appear here." />
            )}
          </div>
        </Card>
        {!admin ? (
          <Card
            title={agent ? 'Support updates' : 'Updates from your support team'}
            subtitle={
              agent
                ? 'Recent assignments, replies, and escalations'
                : 'Recent replies and changes to your requests'
            }
          >
            <div className="px-6 pb-6">
              <NotificationList compact />
            </div>
            {agent && (
              <p className="px-6 pb-6 text-xs text-muted-foreground">
                The first public support reply satisfies the response target. Internal notes do not
                count. Pending tickets continue consuming business time.
              </p>
            )}
          </Card>
        ) : (
          <Card
            title="Knowledge that helps"
            subtitle="Sample guides · knowledge base backend planned"
            action={<TextLink to="/knowledge">Browse all</TextLink>}
          >
            <div className="px-5 pb-3">
              {articles
                .filter((a) => a.featured)
                .map((a) => (
                  <Link to={'/knowledge/' + a.id} className="article-mini" key={a.id}>
                    <span className="article-icon">
                      <BookOpen size={18} />
                    </span>
                    <div>
                      <strong>{a.title}</strong>
                      <p>
                        {a.category} · {a.readMinutes} min read
                      </p>
                    </div>
                    <ArrowUpRight size={16} />
                  </Link>
                ))}
            </div>
          </Card>
        )}
      </div>
      {admin && (
        <>
          <div className="dashboard-chart-grid mt-5">
            <Card
              title="Agent workload"
              subtitle="Current assignments · volume is not a performance ranking"
              action={<TextLink to="/reports">SLA & response metrics</TextLink>}
            >
              <div className="chart-legend">
                <span>
                  <i style={{ background: 'var(--chart-violet)' }} />
                  Assigned
                </span>
                <span>
                  <i style={{ background: 'var(--chart-green)' }} />
                  Resolved
                </span>
              </div>
              <PerformanceChart series={d.performance} />
            </Card>
            <Card title="Priority breakdown" subtitle="Organization requests">
              <DistributionChart
                counts={d.priority.map((v) => ({ ...v, name: priorityLabels[v.name] }))}
              />
            </Card>
          </div>
          <div className="admin-actions">
            <div>
              <h2>Keep your support team in sync</h2>
              <p>
                {d.activeAgents} active agents · {d.unassigned} unassigned requests
              </p>
              <p>
                Mean elapsed resolution:{' '}
                {d.average === null ? 'No completed tickets' : `${d.average.toFixed(1)} hours`}
              </p>
            </div>
            <Button asChild variant="outline">
              <Link to="/team">
                <Users />
                Team management
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/reports">
                View reports
                <ArrowUpRight />
              </Link>
            </Button>
          </div>
        </>
      )}
    </motion.div>
  );
}
