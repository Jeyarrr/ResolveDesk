import type { Article, DemoState, Ticket, User } from '../types/domain';
import { categories, priorities, statuses } from '../types/domain';

export const DEMO_REFERENCE = '2026-10-19T08:00:00.000Z';
export const DEMO_PASSWORD = 'demo-only'; // Public demo input, not a credential.
export const demoUserIds = { employee: 'u-employee', agent: 'u-agent', admin: 'u-admin' } as const;
const users: User[] = [
  {
    id: 'u-employee',
    name: 'Alex Morgan',
    email: 'employee@resolvedesk.example',
    role: 'employee',
    department: 'Product Design',
    initials: 'AM',
    status: 'Active',
  },
  {
    id: 'u-agent',
    name: 'Jordan Lee',
    email: 'agent@resolvedesk.example',
    role: 'agent',
    department: 'IT Operations',
    initials: 'JL',
    status: 'Active',
  },
  {
    id: 'u-admin',
    name: 'Taylor Brooks',
    email: 'admin@resolvedesk.example',
    role: 'admin',
    department: 'IT Operations',
    initials: 'TB',
    status: 'Active',
  },
  {
    id: 'u-sam',
    name: 'Sam Rivera',
    email: 'sam@resolvedesk.example',
    role: 'agent',
    department: 'IT Operations',
    initials: 'SR',
    status: 'Active',
  },
  {
    id: 'u-priya',
    name: 'Priya Sharma',
    email: 'priya@resolvedesk.example',
    role: 'agent',
    department: 'Infrastructure',
    initials: 'PS',
    status: 'Active',
  },
  {
    id: 'u-noah',
    name: 'Noah Williams',
    email: 'noah@resolvedesk.example',
    role: 'employee',
    department: 'Finance',
    initials: 'NW',
    status: 'Active',
  },
  {
    id: 'u-mia',
    name: 'Mia Chen',
    email: 'mia@resolvedesk.example',
    role: 'employee',
    department: 'People & Culture',
    initials: 'MC',
    status: 'Away',
  },
  {
    id: 'u-eli',
    name: 'Eli Davis',
    email: 'eli@resolvedesk.example',
    role: 'agent',
    department: 'Service Desk',
    initials: 'ED',
    status: 'Away',
  },
];
const scenarios = [
  [
    'Unable to connect to the office printer',
    'Hardware',
    'The third-floor printer appears offline. I have restarted my laptop and checked the connection, but documents remain in the queue.',
  ],
  [
    'Company email keeps asking me to sign in',
    'Email',
    'My email client repeatedly shows a sign-in prompt. Webmail works, but the desktop app stops syncing messages after a few minutes.',
  ],
  [
    'Workstation is running unusually slow',
    'Hardware',
    'My workstation becomes unresponsive during normal work. Opening large design files takes several minutes, even after a restart.',
  ],
  [
    'VPN disconnects during remote meetings',
    'Network',
    'The company VPN drops every fifteen minutes from my home connection. This interrupts access to shared drives and internal tools.',
  ],
  [
    'Intermittent network outage on floor two',
    'Network',
    'Several workstations on floor two lose network connectivity at the same time. Wi-Fi and wired connections are both affected.',
  ],
  [
    'Request to install a diagramming application',
    'Software',
    'Our team needs an approved diagramming application for project planning. Please review the request and advise on license availability.',
  ],
  [
    'Access request for the finance workspace',
    'Access',
    'I have joined the quarterly reporting project and need access to its shared workspace. My manager is available to confirm approval.',
  ],
  [
    'Laptop battery needs replacement',
    'Hardware',
    'The laptop battery no longer holds a charge for more than thirty minutes. Please arrange an assessment and replacement if needed.',
  ],
  [
    'Calendar invitations are not syncing',
    'Email',
    'Meeting invitations accepted on the desktop do not appear on my mobile calendar. The issue started after a recent software update.',
  ],
  [
    'Design software license has expired',
    'Software',
    'The design application is showing an expired license message. This is blocking work on the current project handoff.',
  ],
  [
    'Multi-factor device enrollment assistance',
    'Access',
    'I have a replacement phone and need help enrolling it in the approved authentication process. My old device is no longer available.',
  ],
  [
    'Conference room display has no signal',
    'Hardware',
    'The display in meeting room Cedar shows no signal when connected to a laptop. We have tried another cable without success.',
  ],
] as const;

export function createSeed(): DemoState {
  const reference = Date.parse(DEMO_REFERENCE);
  const tickets: Ticket[] = Array.from({ length: 48 }, (_, i) => {
    const scenario = scenarios[i % scenarios.length]!;
    const status = statuses[i % statuses.length]!;
    const created = reference - (i < 18 ? i * 18 : i * 32) * 3_600_000;
    const resolved = status === 'Resolved' || status === 'Closed';
    const requesterId = ['u-employee', 'u-noah', 'u-mia'][i % 3]!;
    const assigneeId = i % 7 === 0 ? null : ['u-agent', 'u-sam', 'u-priya', 'u-eli'][i % 4]!;
    const createdAt = new Date(created).toISOString();
    const updatedAt = new Date(created + (resolved ? 4 + (i % 18) : 1) * 3_600_000).toISOString();
    return {
      id: `RD-${1048 - i}`,
      subject: scenario[0],
      description: scenario[2],
      category: scenario[1],
      priority: priorities[(i + 2) % priorities.length]!,
      status,
      requesterId,
      assigneeId,
      createdAt,
      updatedAt,
      dueAt: new Date(created + 48 * 3_600_000).toISOString(),
      resolvedAt: resolved ? updatedAt : null,
      attachments: [],
      comments:
        i % 3 === 0
          ? [
              {
                id: `comment-${i}`,
                authorId: assigneeId ?? 'u-agent',
                body: 'Thanks for the details. I am reviewing the issue and will share the next steps here.',
                createdAt: updatedAt,
              },
            ]
          : [],
      activity: [
        { id: `activity-${i}`, actorId: requesterId, text: 'Created this ticket', createdAt },
        ...(status !== 'Open'
          ? [
              {
                id: `status-${i}`,
                actorId: assigneeId ?? 'u-admin',
                text: `Changed status from Open to ${status}`,
                createdAt: updatedAt,
              },
            ]
          : []),
      ],
    };
  });
  return {
    version: 1,
    users: structuredClone(users),
    tickets,
    notifications: Object.values(demoUserIds).flatMap((userId, roleIndex) =>
      tickets
        .filter((t) => userId === 'u-admin' || t.requesterId === userId || t.assigneeId === userId)
        .slice(0, 5)
        .map((ticket, i) => ({
          id: `notice-${roleIndex}-${i}`,
          userId,
          title: i === 0 ? 'A ticket needs your attention' : 'Ticket activity update',
          body: `${ticket.id} · ${ticket.subject}`,
          ticketId: ticket.id,
          createdAt: ticket.updatedAt,
          read: i > 2,
        })),
    ),
    preferences: {},
  };
}

export const articles: Article[] = [
  {
    id: 'vpn',
    title: 'Connect to the company VPN',
    summary: 'A simple guide to secure access when working remotely.',
    category: 'Network',
    readMinutes: 4,
    featured: true,
    sections: [
      {
        title: 'Before you connect',
        body: 'Check that your internet connection is stable and that you have the company-approved VPN client installed. Only use configuration supplied by your IT team.',
      },
      {
        title: 'Establish a connection',
        body: 'Open the approved client, select your company connection, and sign in through the official identity page. Complete the verification prompt on your registered device.',
      },
      {
        title: 'If the connection drops',
        body: 'Note the error message and time, restart the client once, and try again. If the issue continues, submit a Network ticket with the error text. Never include passwords or verification codes.',
      },
    ],
  },
  {
    id: 'password',
    title: 'Keep your work account secure',
    summary: 'Practical steps for passwords, verification, and account safety.',
    category: 'Access',
    readMinutes: 3,
    featured: true,
    sections: [
      {
        title: 'Use your approved password manager',
        body: 'Generate a unique password for each work account and store it in the organization-approved password manager. Do not share passwords through tickets or chat.',
      },
      {
        title: 'Protect your verification methods',
        body: 'Approve sign-in requests only when you initiated them. Report unexpected requests to IT using an Access ticket.',
      },
      {
        title: 'Lost access?',
        body: 'Contact your IT support team through the approved recovery channel. Account recovery and password reset are not available in this demonstration.',
      },
    ],
  },
  {
    id: 'printer',
    title: 'Troubleshoot an offline printer',
    summary: 'Get your documents moving again with a few checks.',
    category: 'Hardware',
    readMinutes: 5,
    featured: true,
    sections: [
      {
        title: 'Check the basics',
        body: 'Confirm the printer is powered on, has paper, and does not display an error. Check that your device is connected to the company network.',
      },
      {
        title: 'Check your print queue',
        body: 'Open your printer settings and verify you selected the correct office printer. Cancel duplicate jobs and retry a single test page.',
      },
      {
        title: 'Ask for help',
        body: 'If it remains offline, create a Hardware ticket. Include the printer location, model if visible, and any error messages.',
      },
    ],
  },
  {
    id: 'email',
    title: 'Fix email synchronization issues',
    summary: 'Restore consistent email and calendar updates.',
    category: 'Email',
    readMinutes: 4,
    featured: false,
    sections: [
      {
        title: 'Check your connection',
        body: 'Verify internet access, then compare the desktop app with your approved webmail portal. Note which messages or calendar events are missing.',
      },
      {
        title: 'Refresh your client',
        body: 'Close and reopen the email application. If prompted, sign in through the official company identity page.',
      },
      {
        title: 'Escalate with useful details',
        body: 'Create an Email ticket with the application version and error message. Exclude message contents that contain confidential information.',
      },
    ],
  },
  {
    id: 'software',
    title: 'Request software for your team',
    summary: 'What to include in a software installation request.',
    category: 'Software',
    readMinutes: 3,
    featured: false,
    sections: [
      {
        title: 'Describe the business need',
        body: 'Include the application name, intended use, number of users, and the date you need access. Mention any relevant manager approval.',
      },
      {
        title: 'IT review',
        body: 'The IT team will review compatibility, licensing, and organizational requirements before arranging installation.',
      },
    ],
  },
  {
    id: 'workstation',
    title: 'Improve workstation performance',
    summary: 'Quick checks for a slow laptop or desktop.',
    category: 'Hardware',
    readMinutes: 6,
    featured: false,
    sections: [
      {
        title: 'Start with a restart',
        body: 'Save your work and restart the device. Close unused applications and check available storage using your operating system settings.',
      },
      {
        title: 'Record the symptoms',
        body: 'Note when the slowdown happens and which applications are affected. Include these details in a Hardware ticket if the problem persists.',
      },
    ],
  },
].map((article) => ({
  ...article,
  updatedAt: '2026-10-12T08:00:00.000Z',
  category: categories.find((c) => c === article.category)!,
}));
