import type { Ticket, User } from '../types/domain';
export interface Person {
  id: string;
  name: string;
  initials: string;
}
export interface ApiUser extends User {
  username: string | null;
  accountStatus: 'active' | 'inactive' | 'suspended';
  departmentId: string | null;
  passwordReady: boolean;
}
export interface Reference {
  id: string;
  name: string;
  description: string;
  active: boolean;
}
export type ApiStatus = 'open' | 'in_progress' | 'pending' | 'resolved' | 'closed';
export type ApiPriority = 'low' | 'medium' | 'high' | 'critical';
export interface ApiTicket {
  id: string;
  ticketNumber: number;
  subject: string;
  description: string;
  categoryId: string;
  category: string;
  priority: ApiPriority;
  status: ApiStatus;
  requesterId: string;
  assignedAgentId: string | null;
  requester: Person;
  assignee: Person | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
}
export interface Comment {
  id: string;
  authorId: string;
  author: Person;
  message: string;
  isInternal: boolean;
  createdAt: string;
}
export interface Activity {
  id: string;
  actor: Person;
  action: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}
export const statusLabels = {
  open: 'Open',
  in_progress: 'In progress',
  pending: 'Pending',
  resolved: 'Resolved',
  closed: 'Closed',
} as const;
export const priorityLabels = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
} as const;
export const statusValue = (value: string) =>
  Object.entries(statusLabels).find(([, label]) => label === value)?.[0] ?? value;
export const priorityValue = (value: string) => value.toLowerCase();
export type TicketRow = Pick<
  Ticket,
  'id' | 'subject' | 'category' | 'priority' | 'status' | 'assigneeId' | 'createdAt' | 'updatedAt'
> & { ticketNumber?: number };
export function displayTicket(t: ApiTicket): TicketRow {
  return {
    ...t,
    priority: priorityLabels[t.priority],
    status: statusLabels[t.status],
    assigneeId: t.assignedAgentId,
  };
}
export function displayPerson(p: Person): Person {
  return p;
}
export function ticketPeople(tickets: ApiTicket[]) {
  return tickets.flatMap((t) =>
    [t.requester, t.assignee].filter((u): u is Person => !!u).map(displayPerson),
  );
}
export interface Analytics {
  total: number;
  average: number | null;
  unassigned: number;
  activeAgents: number | null;
  sla: null;
  status: { name: ApiStatus; value: number }[];
  priority: { name: ApiPriority; value: number }[];
  series: { label: string; received: number; resolved: number }[];
  performance: { name: string; assigned: number; resolved: number }[];
  recent: ApiTicket[];
  since: string;
  recentActivity: {
    id: string;
    ticketId: string;
    ticketNumber: number;
    action: string;
    actorName: string;
    createdAt: string;
  }[];
}
