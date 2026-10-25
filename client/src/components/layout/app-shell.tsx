import { NotificationCenter } from '../../features/notifications/notification-center';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import {
  ChevronDown,
  ChevronRight,
  Command,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Sparkles,
  Sun,
  ArrowUpRight,
} from 'lucide-react';
import { useApp } from '../../app/context';
import { useApi } from '../../hooks/use-api';
import { queryString } from '../../services/api';
import type { ApiTicket, Page } from '../../services/contracts';
import { navigation, navigationFor } from '../../routes/navigation';
import { roleLabels } from '../../types/domain';
import { readStorage, writeStorage } from '../../lib/storage';
import { cn } from '../../lib/utils';
import { articles } from '../../data/seed';
import { Avatar, Logo, InlineMessage } from '../shared/primitives';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { Tooltip } from '../ui/tooltip';

export function AppShell() {
  const { user, theme, setTheme, logout } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(
    () => readStorage('resolvedesk.sidebar') === 'collapsed',
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [logoutError, setLogoutError] = useState('');
  const searchQuery = useApi<Page<ApiTicket>>(
    '/tickets?' + queryString({ search, limit: 5 }),
    searchOpen,
  );
  const notificationCount = useApi<{ count: number }>('/notifications/unread-count');
  const contentRef = useRef<HTMLElement>(null);
  useEffect(() => {
    contentRef.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [location.pathname]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  if (!user) return null;
  const unread = notificationCount.data?.count ?? 0;
  const title =
    navigation.find((item) => item.to === location.pathname)?.label ??
    (location.pathname.startsWith('/tickets/')
      ? 'Ticket details'
      : location.pathname.startsWith('/knowledge/')
        ? 'Article'
        : 'Workspace');
  const items = navigationFor(user.role);
  const term = search.trim().toLowerCase();
  const results = searchQuery.data?.items ?? [];
  const knowledgeResults = articles.filter((a) => a.title.toLowerCase().includes(term)).slice(0, 3);
  const go = (path: string) => {
    setSearchOpen(false);
    setMobileOpen(false);
    navigate(path);
  };
  const sidebar = (compact: boolean) => (
    <>
      <Link
        to="/"
        className="sidebar-brand"
        aria-label="ResolveDesk overview"
        onClick={() => setMobileOpen(false)}
      >
        <Logo compact={compact} />
      </Link>
      <div className={cn('workspace-picker', compact && 'workspace-picker-compact')}>
        <span className="workspace-mark">R</span>
        {!compact && (
          <>
            <div>
              <strong>ResolveDesk</strong>
              <span>IT support workspace</span>
            </div>
            <ChevronDown size={14} />
          </>
        )}
      </div>
      <nav aria-label="Main navigation" className="sidebar-nav">
        {items.map((item, i) => (
          <div key={item.to}>
            {items[i - 1]?.section !== item.section && (
              <div className={cn('nav-section', compact && 'nav-section-compact')}>
                {compact ? <span /> : item.section}
              </div>
            )}
            <Tooltip label={item.label}>
              <NavLink
                to={item.to}
                end
                className={cn('nav-item', compact && 'nav-item-compact')}
                onClick={() => setMobileOpen(false)}
                aria-label={compact ? item.label : undefined}
              >
                <item.icon size={18} />
                {!compact && (
                  <>
                    <span>{item.label}</span>
                    {item.to === '/notifications' && unread > 0 && (
                      <span className="nav-count">{unread}</span>
                    )}
                  </>
                )}
              </NavLink>
            </Tooltip>
          </div>
        ))}
      </nav>
      {!compact && (
        <div className="sidebar-help">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles size={16} className="text-primary" />A little help goes a long way
          </div>
          <p>Find answers before you open a ticket.</p>
          <Link to="/knowledge" onClick={() => setMobileOpen(false)}>
            Explore the knowledge base <ArrowUpRight size={14} />
          </Link>
        </div>
      )}
      <div className="sidebar-footer">
        <Avatar user={user} />
        {!compact && (
          <>
            <div className="min-w-0 flex-1">
              <strong className="block truncate text-xs">{user.name}</strong>
              <span className="text-[11px] text-muted-foreground">{roleLabels[user.role]}</span>
            </div>
            <span className="size-2 rounded-full bg-emerald-400" title="Signed in" />
          </>
        )}
      </div>
    </>
  );
  return (
    <div className={cn('app-shell', collapsed && 'sidebar-collapsed')}>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar">{sidebar(collapsed)}</aside>
      <Dialog
        open={mobileOpen}
        onOpenChange={setMobileOpen}
        title="Workspace navigation"
        description="Navigate your ResolveDesk workspace."
        className="mobile-nav-dialog"
      >
        <div className="mobile-sidebar">{sidebar(false)}</div>
      </Dialog>
      <div className="app-body">
        <header className="topbar">
          <Button
            variant="ghost"
            size="icon"
            className="desktop-collapse"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => {
              setCollapsed(!collapsed);
              writeStorage('resolvedesk.sidebar', collapsed ? 'expanded' : 'collapsed');
            }}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
          >
            <Menu />
          </Button>
          <nav aria-label="Breadcrumb" className="breadcrumb">
            <Link to="/">Workspace</Link>
            <ChevronRight size={13} />
            <span aria-current="page">{title}</span>
          </nav>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <button
              className="global-search"
              onClick={() => setSearchOpen(true)}
              aria-label="Search workspace"
            >
              <Search size={16} />
              <span>Search anything…</span>
              <kbd>
                <Command size={10} /> K
              </kbd>
            </button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun /> : <Moon />}
            </Button>
            <NotificationCenter />
            <div className="mx-1 h-6 w-px bg-border" />
            <Dropdown.Root>
              <Dropdown.Trigger asChild>
                <button className="profile-trigger" aria-label="Open profile menu">
                  <Avatar user={user} />
                  <span className="profile-summary">
                    <strong>{user.name}</strong>
                    <small>{roleLabels[user.role]}</small>
                  </span>
                  <ChevronDown size={12} />
                </button>
              </Dropdown.Trigger>
              <Dropdown.Portal>
                <Dropdown.Content align="end" sideOffset={12} className="dropdown-content">
                  <Dropdown.Label className="px-3 py-2">
                    <strong className="block text-sm">{user.name}</strong>
                    <span className="text-xs text-muted-foreground">{user.email}</span>
                  </Dropdown.Label>
                  <Dropdown.Separator className="my-1 h-px bg-border" />
                  <Dropdown.Item className="dropdown-item" onSelect={() => navigate('/settings')}>
                    <Settings size={16} />
                    Profile & settings
                  </Dropdown.Item>
                  <Dropdown.Item
                    className="dropdown-item"
                    onSelect={() => {
                      void logout()
                        .then(() => navigate('/login'))
                        .catch(() =>
                          setLogoutError(
                            'Logout failed. Please retry; your server session is still active.',
                          ),
                        );
                    }}
                  >
                    <LogOut size={16} />
                    Log out
                  </Dropdown.Item>
                </Dropdown.Content>
              </Dropdown.Portal>
            </Dropdown.Root>
          </div>
        </header>
        <main id="main-content" ref={contentRef} tabIndex={-1} className="main-content">
          {logoutError && <InlineMessage error>{logoutError}</InlineMessage>}
          <Outlet />
        </main>
        <footer className="app-footer">
          <span>
            ResolveDesk <span className="text-border">/</span> A calmer way to support.
          </span>
          <span>
            Phase 4.5 <span className="mx-2">·</span> BuiltByJayr
          </span>
        </footer>
      </div>
      <Dialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title="Search your workspace"
        description="Find tickets and knowledge base articles you have permission to view."
      >
        <label htmlFor="workspace-search" className="sr-only">
          Search tickets and articles
        </label>
        <input
          id="workspace-search"
          className="input"
          placeholder="Try VPN, printer, or RD-1048…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="mt-4 max-h-[50vh] overflow-auto">
          <p className="eyebrow mb-2">Tickets</p>
          {searchQuery.error && <InlineMessage error>{searchQuery.error.message}</InlineMessage>}
          {searchQuery.isPending && <p>Searching tickets…</p>}
          {results.map((ticket) => (
            <button
              key={ticket.id}
              className="search-result"
              onClick={() => go(`/tickets/${ticket.id}`)}
            >
              <span className="font-mono text-xs text-muted-foreground">{`RD-${ticket.ticketNumber}`}</span>
              <span>{ticket.subject}</span>
            </button>
          ))}
          {!results.length && (
            <p className="p-2 text-sm text-muted-foreground">No matching tickets.</p>
          )}
          <p className="eyebrow mb-2 mt-4">Knowledge base</p>
          {knowledgeResults.map((article) => (
            <button
              key={article.id}
              className="search-result"
              onClick={() => go(`/knowledge/${article.id}`)}
            >
              {article.title}
              <ArrowUpRight size={14} />
            </button>
          ))}
          {!knowledgeResults.length && (
            <p className="p-2 text-sm text-muted-foreground">No matching articles.</p>
          )}
        </div>
      </Dialog>
    </div>
  );
}
