import { uploadForm } from './attachment-form';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Send } from 'lucide-react';
import { useApp } from '../../app/context';
import { useApi, useApiMutation } from '../../hooks/use-api';
import { api } from '../../services/api';
import type { Attachment, Comment, Page, ResponseTemplate } from '../../services/contracts';
import { Avatar, Badge, Card, InlineMessage } from '../../components/shared/primitives';
import { QueryState } from '../../components/shared/query-state';
import { Button } from '../../components/ui/button';
import { formatDate } from '../../lib/utils';
import { roleLabels } from '../../types/domain';
import { AttachmentList, FilePicker, UploadProgress } from './attachments';

export function TicketConversation({ ticketId }: { ticketId: string }) {
  const { user } = useApp();
  const client = useQueryClient();
  const comments = useApi<Comment[]>(`/tickets/${ticketId}/comments`);
  const attachments = useApi<Attachment[]>(`/tickets/${ticketId}/attachments`);
  const state = useApi<{ unreadCount: number }>(`/tickets/${ticketId}/conversation-state`);
  const [search, setSearch] = useState('');
  const templates = useApi<Page<ResponseTemplate>>(
    '/response-templates?limit=100&search=' + encodeURIComponent(search),
    user?.role !== 'employee',
  );
  const mutation = useApiMutation();
  const [reply, setReply] = useState(''),
    [internal, setInternal] = useState(false);
  const [files, setFiles] = useState<File[]>([]),
    [progress, setProgress] = useState(0);
  const [controller, setController] = useState<AbortController | null>(null);
  const [submissionId, setSubmissionId] = useState(() => crypto.randomUUID());
  const [message, setMessage] = useState(''),
    [readError, setReadError] = useState('');
  const [readAttempt, setReadAttempt] = useState(0);
  const through = comments.data?.reduce((max, c) => Math.max(max, c.position), 0);
  useEffect(() => {
    if (through === undefined) return;
    let active = true;
    void api(`/tickets/${ticketId}/read`, { method: 'POST', body: { throughPosition: through } })
      .then(() => {
        if (active) setReadError('');
        void client.invalidateQueries({
          queryKey: ['protected', `/tickets/${ticketId}/conversation-state`],
        });
        void client.invalidateQueries({
          predicate: (q) =>
            q.queryKey[0] === 'protected' &&
            typeof q.queryKey[1] === 'string' &&
            q.queryKey[1].startsWith('/tickets?'),
        });
      })
      .catch((e: Error) => {
        if (active) setReadError(e.message);
      });
    return () => {
      active = false;
    };
  }, [through, ticketId, client, readAttempt]);
  function changed() {
    setSubmissionId(crypto.randomUUID());
    setMessage('');
  }
  return (
    <Card
      title="Conversation"
      subtitle="Public replies and private support notes. Messages refresh after sending or when you return to this window."
      action={
        <Button
          size="sm"
          variant="outline"
          disabled={comments.isFetching}
          onClick={() => {
            void comments.refetch();
            void attachments.refetch();
            void state.refetch();
          }}
        >
          <RefreshCw size={14} />
          Refresh
        </Button>
      }
    >
      <div className="space-y-5 px-6 pb-6">
        <QueryState query={comments} />
        <QueryState query={attachments} />
        {!!state.data?.unreadCount && (
          <p className="text-xs text-primary">{state.data.unreadCount} unread replies</p>
        )}
        {readError && (
          <InlineMessage error>
            Could not save read position.{' '}
            <Button variant="outline" size="sm" onClick={() => setReadAttempt((v) => v + 1)}>
              Retry read update
            </Button>
          </InlineMessage>
        )}
        {comments.data?.map((c) => (
          <article
            key={c.id}
            className={`comment ${c.isInternal ? 'rounded-xl border border-violet-500/30 bg-violet-500/5 p-3' : ''}`}
          >
            <Avatar user={c.author} />
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-medium">{c.author.name}</h3>
                <span className="text-xs text-muted-foreground">{roleLabels[c.authorRole]}</span>
                <Badge value={c.isInternal ? 'Internal note' : 'Public reply'} />
                {c.isUnread && <span className="text-xs font-medium text-primary">New reply</span>}
                <time className="text-[11px] text-muted-foreground" dateTime={c.createdAt}>
                  {formatDate(c.createdAt, true)}
                </time>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
                {c.message}
              </p>
              <AttachmentList items={attachments.data?.filter((a) => a.commentId === c.id) ?? []} />
            </div>
          </article>
        ))}
        {comments.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No replies yet. Start the conversation below.
          </p>
        )}
        <form
          className="space-y-4 border-t border-border pt-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const cancel = new AbortController();
            setController(cancel);
            setProgress(0);
            setMessage('');
            try {
              await mutation.mutateAsync({
                path: `/tickets/${ticketId}/comments`,
                body: files.length
                  ? uploadForm({ message: reply, isInternal: internal }, files, submissionId)
                  : { message: reply, isInternal: internal, submissionId },
                onProgress: setProgress,
                signal: cancel.signal,
              });
              setReply('');
              setFiles([]);
              setSubmissionId(crypto.randomUUID());
              setMessage(internal ? 'Internal note saved.' : 'Reply saved.');
            } catch {
              /* Keep text, files and idempotency token for safe retries. */
            }
          }}
        >
          {user?.role !== 'employee' && (
            <div className="space-y-3">
              <label className="label">
                Search saved replies
                <input
                  className="input"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <QueryState query={templates} />
              <label className="label">
                Insert saved reply
                <select
                  aria-label="Insert saved reply"
                  className="select w-full"
                  value=""
                  disabled={mutation.isPending}
                  onChange={(e) => {
                    const template = templates.data?.items.find((t) => t.id === e.target.value);
                    if (template) {
                      setReply(template.body);
                      changed();
                    }
                  }}
                >
                  <option value="">Choose a response to edit before sending</option>
                  {templates.data?.items.map((t) => (
                    <option value={t.id} key={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </label>
              {templates.data && templates.data.total > 100 && (
                <p className="text-xs text-muted-foreground">
                  Search to find additional saved replies.
                </p>
              )}
            </div>
          )}
          <label className="label" htmlFor="reply">
            Add a reply
          </label>
          <textarea
            id="reply"
            className="input"
            rows={4}
            required
            maxLength={5000}
            value={reply}
            disabled={mutation.isPending}
            onChange={(e) => {
              setReply(e.target.value);
              changed();
            }}
          />
          <p className="text-xs text-muted-foreground">
            {reply.length}/5000 characters. A message is required, including when attaching files.
          </p>
          {user?.role !== 'employee' && (
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={internal}
                disabled={mutation.isPending}
                onChange={(e) => {
                  setInternal(e.target.checked);
                  changed();
                }}
              />
              Internal note (support staff only)
            </label>
          )}
          {internal && (
            <p className="text-xs text-violet-400">
              This note and its files are private to authorized support staff.
            </p>
          )}
          <FilePicker
            files={files}
            disabled={mutation.isPending}
            onChange={(value) => {
              setFiles(value);
              changed();
            }}
          />
          {mutation.error && <InlineMessage error>{mutation.error.message}</InlineMessage>}
          {message && <InlineMessage>{message}</InlineMessage>}
          {mutation.isPending && files.length > 0 && (
            <UploadProgress progress={progress} onCancel={() => controller?.abort()} />
          )}
          <div className="flex justify-end">
            <Button disabled={mutation.isPending || !reply.trim()}>
              <Send />
              {internal ? 'Post internal note' : 'Post reply'}
            </Button>
          </div>
        </form>
      </div>
    </Card>
  );
}
