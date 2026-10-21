import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { useApi, useApiMutation } from '../../hooks/use-api';
import { queryString } from '../../services/api';
import type { ApiUser, Page, Reference } from '../../services/contracts';
import { roles, roleLabels } from '../../types/domain';
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  InlineMessage,
  PageHeader,
} from '../../components/shared/primitives';
import { QueryState } from '../../components/shared/query-state';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
function ReferenceManager({ path, title }: { path: string; title: string }) {
  const query = useApi<Reference[]>(path),
    mutation = useApiMutation();
  const [editing, setEditing] = useState<Reference | null | undefined>(undefined);
  return (
    <Card
      title={title}
      action={
        <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
          <Plus />
          Add
        </Button>
      }
    >
      <div className="px-6 pb-6 space-y-3">
        <QueryState query={query} />
        {query.data?.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3">
            <div>
              <strong className="text-sm">{r.name}</strong>
              <p className="text-xs text-muted-foreground">
                {r.active ? 'Active' : 'Archived'} · {r.description}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                mutation.reset();
                setEditing(r);
              }}
            >
              Edit
            </Button>
          </div>
        ))}
      </div>
      <Dialog
        open={editing !== undefined}
        onOpenChange={(o) => {
          if (!o) setEditing(undefined);
        }}
        title={editing ? 'Edit ' + title : 'Add ' + title}
        description="Archived entries remain on existing records and cannot be selected for new records."
      >
        <form
          key={editing?.id ?? 'new'}
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              await mutation.mutateAsync({
                path: path + (editing ? '/' + editing.id : ''),
                method: editing ? 'PATCH' : 'POST',
                body: {
                  name: f.get('name'),
                  description: f.get('description'),
                  active: f.get('active') === 'on',
                },
              });
              setEditing(undefined);
            } catch {
              /* error below */
            }
          }}
        >
          <label className="label">
            Name
            <input
              name="name"
              className="input"
              minLength={2}
              maxLength={80}
              defaultValue={editing?.name}
              required
            />
          </label>
          <label className="label">
            Description
            <textarea
              name="description"
              className="input"
              maxLength={1000}
              defaultValue={editing?.description}
            />
          </label>
          <label className="flex gap-2 text-sm">
            <input name="active" type="checkbox" defaultChecked={editing?.active ?? true} />
            Active
          </label>
          {mutation.error && <InlineMessage error>{mutation.error.message}</InlineMessage>}
          <Button disabled={mutation.isPending}>Save</Button>
        </form>
      </Dialog>
    </Card>
  );
}
export default function TeamPage() {
  const [search, setSearch] = useState(''),
    [role, setRole] = useState(''),
    [status, setStatus] = useState(''),
    [page, setPage] = useState(1),
    [editing, setEditing] = useState<ApiUser | null | undefined>(undefined);
  const query = useApi<Page<ApiUser>>(
      '/users?' + queryString({ search, role, accountStatus: status, page, limit: 12 }),
    ),
    departments = useApi<Reference[]>('/departments'),
    mutation = useApiMutation();
  return (
    <>
      <PageHeader
        eyebrow="THE PEOPLE BEHIND THE RESOLUTIONS"
        title="Team management"
        description="Manage accounts, support roles, departments, and ticket categories."
        actions={
          <Button
            onClick={() => {
              mutation.reset();
              setEditing(null);
            }}
          >
            <Plus />
            Create account
          </Button>
        }
      />
      <section className="card overflow-hidden" aria-label="Team directory">
        <div className="filter-toolbar">
          <div className="search-input">
            <Search size={16} />
            <input
              aria-label="Search team"
              placeholder="Search name or email…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="flex gap-2">
            <select
              aria-label="Filter team role"
              className="select"
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All roles</option>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {roleLabels[r]}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter team status"
              className="select"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {['active', 'inactive', 'suspended'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
        <QueryState query={query} />
        {query.data?.items.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <caption className="sr-only">Organization accounts</caption>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Role</th>
                  <th>Department</th>
                  <th>Status</th>
                  <th>Access</th>
                  <th>Manage</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <Avatar
                          user={{
                            ...u,
                            initials: u.name
                              .split(' ')
                              .map((n) => n[0])
                              .slice(0, 2)
                              .join(''),
                          }}
                        />
                        <div>
                          <strong className="block text-foreground">{u.name}</strong>
                          <span className="text-xs">{u.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>{roleLabels[u.role]}</td>
                    <td>{u.department || '—'}</td>
                    <td>
                      <Badge value={u.accountStatus} />
                    </td>
                    <td>{u.passwordReady ? 'Password provisioned' : 'Awaiting provisioning'}</td>
                    <td>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          mutation.reset();
                          setEditing(u);
                        }}
                      >
                        Edit {u.name}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !query.isPending &&
          !query.error && (
            <EmptyState title="No matching members" description="Try another search or filter." />
          )
        )}
        <div className="pagination">
          <span>{query.data?.total ?? 0} members</span>
          <div className="flex gap-2">
            <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <span className="p-2">Page {page}</span>
            <Button
              variant="outline"
              disabled={page * 12 >= (query.data?.total ?? 0)}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </section>
      <div className="dashboard-chart-grid mt-5">
        <ReferenceManager path="/departments" title="Departments" />
        <ReferenceManager path="/ticket-categories" title="Ticket categories" />
      </div>
      <Dialog
        open={editing !== undefined}
        onOpenChange={(o) => {
          if (!o) setEditing(undefined);
        }}
        title={editing ? 'Edit account' : 'Create account'}
        description="New accounts require password provisioning. Email invitations are not configured; development setup is documented in the README."
      >
        <form
          key={editing?.id ?? 'new'}
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              await mutation.mutateAsync({
                path: '/users' + (editing ? '/' + editing.id : ''),
                method: editing ? 'PATCH' : 'POST',
                body: {
                  fullName: f.get('fullName'),
                  email: f.get('email'),
                  role: f.get('role'),
                  departmentId: f.get('departmentId') || null,
                  accountStatus: f.get('accountStatus'),
                },
              });
              setEditing(undefined);
            } catch {
              /* error below */
            }
          }}
        >
          <label className="label">
            Full name
            <input
              name="fullName"
              className="input"
              defaultValue={editing?.name}
              minLength={2}
              maxLength={100}
              required
            />
          </label>
          <label className="label">
            Email
            <input
              name="email"
              type="email"
              className="input"
              defaultValue={editing?.email}
              maxLength={254}
              required
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="label">
              Role
              <select
                name="role"
                className="select w-full"
                defaultValue={editing?.role ?? 'employee'}
              >
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {roleLabels[r]}
                  </option>
                ))}
              </select>
            </label>
            <label className="label">
              Status
              <select
                name="accountStatus"
                className="select w-full"
                defaultValue={editing?.accountStatus ?? 'inactive'}
              >
                {(editing ? ['active', 'inactive', 'suspended'] : ['inactive', 'suspended']).map(
                  (s) => (
                    <option key={s}>{s}</option>
                  ),
                )}
              </select>
            </label>
          </div>
          <label className="label">
            Department
            <select
              name="departmentId"
              className="select w-full"
              defaultValue={editing?.departmentId ?? ''}
            >
              <option value="">No department</option>
              {departments.data
                ?.filter((d) => d.active || d.id === editing?.departmentId)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {!d.active ? ' (archived)' : ''}
                  </option>
                ))}
            </select>
          </label>
          {mutation.error && <InlineMessage error>{mutation.error.message}</InlineMessage>}
          <Button disabled={mutation.isPending}>Save account</Button>
        </form>
      </Dialog>
    </>
  );
}
