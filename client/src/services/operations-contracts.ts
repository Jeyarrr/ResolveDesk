export interface Notification {
  id: string;
  ticketId: string;
  ticketNumber: number;
  type: string;
  title: string;
  readAt: string | null;
  createdAt: string;
}
export interface Preferences {
  assignments: boolean;
  replies: boolean;
  status: boolean;
  escalations: boolean;
  sla: boolean;
}
export interface Calendar {
  timezone: 'Asia/Manila';
  startHour: number;
  endHour: number;
  weekdays: number[];
  holidays: string[];
}
export interface SlaPolicy {
  id: string;
  name: string;
  priority: string;
  responseMinutes: number;
  resolutionMinutes: number;
  warningPercent: number;
  calendar: Calendar;
  active: boolean;
}
export interface TicketSla {
  id: string;
  ticketId: string;
  cycle: number;
  ticketNumber?: number;
  subject?: string;
  responseDueAt: string;
  resolutionDueAt: string;
  responseState: string;
  resolutionState: string;
  responseRemainingMinutes: number | null;
  resolutionRemainingMinutes: number | null;
  resolvedAt: string | null;
  snapshot: SlaPolicy;
}
export interface SlaOverview {
  tracked: number;
  limited: boolean;
  completed: number;
  compliant: number;
  compliance: number | null;
  approaching: number;
  responseBreached: number;
  resolutionBreached: number;
  averageResponseMinutes: number | null;
  averageResolutionMinutes: number | null;
  highPriority: number;
  items: TicketSla[];
}
export interface ReportData {
  filters: { from: string; to: string; timezone: string };
  metrics: {
    total: number;
    reopenedTickets: number;
    reopenEvents: number;
    reopenFrequency: number | null;
    averageResponseMinutes: number | null;
    averageResolutionMinutes: number | null;
    medianResolutionMinutes: number | null;
    tracked: number;
    active: number;
    completed: number;
    compliant: number;
    compliance: number | null;
    responseCompliance: number | null;
    resolutionCompliance: number | null;
    missingResponse: number;
    approaching: number;
    responseBreached: number;
    resolutionBreached: number;
  };
  status: { name: string; value: number }[];
  priority: { name: string; value: number }[];
  categories: { name: string; value: number }[];
  departments: { name: string; value: number }[];
  breachPriority: { name: string; value: number }[];
  agents: {
    id: string;
    name: string;
    assigned: number;
    resolved: number;
    open: number;
    averageResponseMinutes: number | null;
    averageResolutionMinutes: number | null;
    compliance: number | null;
    breaches: number;
  }[];
  series: {
    label: string;
    received: number;
    resolved: number;
    breaches: number;
    averageResolutionMinutes: number | null;
  }[];
  approaching: { ticketId: string; responseDueAt: string; resolutionDueAt: string }[];
}
