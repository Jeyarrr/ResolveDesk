import {
  LayoutDashboard,
  Ticket,
  Layers,
  CirclePlus,
  BookOpen,
  Bell,
  Users,
  ChartNoAxesCombined,
  Settings,
} from 'lucide-react';
import type { Role } from '../types/domain';
export const navigation = [
  {
    to: '/',
    label: 'Overview',
    icon: LayoutDashboard,
    roles: ['employee', 'agent', 'admin'],
    section: 'Workspace',
  },
  {
    to: '/tickets/mine',
    label: 'My Tickets',
    icon: Ticket,
    roles: ['employee', 'agent', 'admin'],
    section: 'Workspace',
  },
  {
    to: '/tickets',
    label: 'All Tickets',
    icon: Layers,
    roles: ['agent', 'admin'],
    section: 'Workspace',
  },
  {
    to: '/tickets/new',
    label: 'Create Ticket',
    icon: CirclePlus,
    roles: ['employee', 'agent', 'admin'],
    section: 'Workspace',
  },
  {
    to: '/knowledge',
    label: 'Knowledge Base',
    icon: BookOpen,
    roles: ['employee', 'agent', 'admin'],
    section: 'Resources',
  },
  {
    to: '/notifications',
    label: 'Notifications',
    icon: Bell,
    roles: ['employee', 'agent', 'admin'],
    section: 'Resources',
  },
  {
    to: '/team',
    label: 'Team Management',
    icon: Users,
    roles: ['admin'],
    section: 'Administration',
  },
  {
    to: '/escalations',
    label: 'Escalations & Workload',
    icon: Layers,
    roles: ['admin'],
    section: 'Administration',
  },
  {
    to: '/reports',
    label: 'Reports & Analytics',
    icon: ChartNoAxesCombined,
    roles: ['admin'],
    section: 'Administration',
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: Settings,
    roles: ['employee', 'agent', 'admin'],
    section: 'Preferences',
  },
] as const;
export function navigationFor(role: Role) {
  return navigation.filter((item) => (item.roles as readonly string[]).includes(role));
}
