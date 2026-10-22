import { useState } from 'react';
import { useApi, useApiMutation } from '../../hooks/use-api';
import type { Page, ResponseTemplate } from '../../services/contracts';
import { Card, InlineMessage } from '../../components/shared/primitives';
import { QueryState } from '../../components/shared/query-state';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';

export function ResponseTemplates() {
  const [page, setPage] = useState(1),
    [search, setSearch] = useState('');
  const query = useApi<Page<ResponseTemplate>>(
    `/response-templates?page=${page}&limit=10&search=${encodeURIComponent(search)}`,
  );
  const mutation = useApiMutation();
  const [editing, setEditing] = useState<ResponseTemplate | null | undefined>(undefined);
  const [archiving, setArchiving] = useState<ResponseTemplate | null>(null);
  const [message, setMessage] = useState('');
  return (
    <Card
      title="Saved response templates"
      subtitle="Support staff share saved replies. Agents manage their own; administrators can manage all."
      action={
        <Button
          size="sm"
          onClick={() => {
            mutation.reset();
            setEditing(null);
          }}
        >
          New saved reply
        </Button>
      }
    >
      <div className="space-y-4 px-6 pb-6">
        <input
          className="input"
          aria-label="Search response templates"
          value={search}
          placeholder="Search saved replies"
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <QueryState query={query} />
        {message && <InlineMessage>{message}</InlineMessage>}
        {query.data?.total === 0 && (
          <p className="text-sm text-muted-foreground">
            No saved replies. Create a reusable troubleshooting response.
          </p>
        )}
        {query.data?.items.map((t) => (
          <div key={t.id} className="space-y-2 rounded-xl border border-border p-3">
            <h3 className="break-words text-sm font-medium">{t.title}</h3>
            <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
              {t.body}
            </p>
            <p className="text-xs text-muted-foreground">Created by {t.authorName}</p>
            {t.canManage && (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`Edit ${t.title}`}
                  onClick={() => {
                    mutation.reset();
                    setEditing(t);
                  }}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Archive ${t.title}`}
                  onClick={() => {
                    mutation.reset();
                    setArchiving(t);
                  }}
                >
                  Archive
                </Button>
              </div>
            )}
          </div>
        ))}
        {query.data && query.data.total > 10 && (
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
              Previous replies
            </Button>
            <Button
              variant="outline"
              disabled={page * 10 >= query.data.total}
              onClick={() => setPage(page + 1)}
            >
              Next replies
            </Button>
          </div>
        )}
      </div>
      <Dialog
        open={editing !== undefined}
        onOpenChange={(v) => {
          if (!v && !mutation.isPending) setEditing(undefined);
        }}
        title={editing ? 'Edit saved reply' : 'New saved reply'}
        description="Saved replies are inserted into the composer for review. They are never sent automatically."
        className="max-h-[85dvh] overflow-y-auto"
      >
        <form
          className="space-y-4"
          key={editing?.id ?? 'new'}
          onSubmit={async (e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            try {
              await mutation.mutateAsync({
                path: `/response-templates${editing ? '/' + editing.id : ''}`,
                method: editing ? 'PATCH' : 'POST',
                body: { title: data.get('title'), body: data.get('body') },
              });
              setEditing(undefined);
              setMessage('Saved reply updated.');
            } catch {
              /* Show mutation error. */
            }
          }}
        >
          <label className="label">
            Template title
            <input
              name="title"
              className="input"
              defaultValue={editing?.title ?? ''}
              required
              minLength={2}
              maxLength={100}
            />
          </label>
          <label className="label">
            Response text
            <textarea
              name="body"
              className="input min-h-36"
              defaultValue={editing?.body ?? ''}
              required
              maxLength={5000}
            />
          </label>
          {mutation.error && <InlineMessage error>{mutation.error.message}</InlineMessage>}
          <Button disabled={mutation.isPending}>Save response template</Button>
        </form>
      </Dialog>
      <Dialog
        open={!!archiving}
        onOpenChange={(v) => {
          if (!v && !mutation.isPending) setArchiving(null);
        }}
        title="Archive saved reply"
        description="This removes the template from the picker. Existing ticket messages are preserved."
      >
        {mutation.error && <InlineMessage error>{mutation.error.message}</InlineMessage>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => setArchiving(null)}>
            Cancel
          </Button>
          <Button
            disabled={mutation.isPending}
            onClick={async () => {
              try {
                await mutation.mutateAsync({
                  path: `/response-templates/${archiving!.id}`,
                  method: 'DELETE',
                  body: {},
                });
                setArchiving(null);
                setMessage('Saved reply archived.');
              } catch {
                /* Show mutation error. */
              }
            }}
          >
            Confirm archive
          </Button>
        </div>
      </Dialog>
    </Card>
  );
}
