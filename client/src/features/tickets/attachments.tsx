import { uploadForm } from './attachment-form';
import { useEffect, useId, useState } from 'react';
import { FileText, Download, Trash2, Upload } from 'lucide-react';
import { useApi, useApiMutation } from '../../hooks/use-api';
import { downloadAttachment } from '../../services/api';
import type { Attachment } from '../../services/contracts';
import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { Card, InlineMessage } from '../../components/shared/primitives';
import { QueryState } from '../../components/shared/query-state';
import { formatDate } from '../../lib/utils';

const fileSize = (bytes: number) =>
  bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
function Preview({ file }: { file: File }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return;
    const value = URL.createObjectURL(file);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [file]);
  return url ? (
    <img
      src={url}
      alt={`Selected preview: ${file.name}`}
      className="h-12 w-12 rounded object-cover"
    />
  ) : (
    <FileText className="shrink-0 text-muted-foreground" />
  );
}
export function FilePicker({
  files,
  onChange,
  disabled = false,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [error, setError] = useState('');
  const limits = useApi<{ maxFiles: number; maxFileBytes: number }>('/attachment-limits');
  const maxFiles = limits.data?.maxFiles ?? 5,
    maxBytes = limits.data?.maxFileBytes ?? 10485760;
  function add(selected: File[]) {
    setError('');
    const next = [...files, ...selected];
    if (next.length > maxFiles) return setError(`Choose at most ${maxFiles} files.`);
    if (selected.some((f) => !f.size || f.size > maxBytes))
      return setError(`Files must be nonempty and at most ${fileSize(maxBytes)} each.`);
    if (selected.some((f) => !/\.(png|jpe?g|webp|pdf|txt)$/i.test(f.name)))
      return setError('Choose PNG, JPG, WEBP, PDF or TXT files.');
    onChange(next);
  }
  return (
    <div className="space-y-3">
      <div
        className="rounded-xl border border-dashed border-border p-4 text-sm"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!disabled) add(Array.from(e.dataTransfer.files));
        }}
      >
        <label htmlFor={id} className="label">
          <span className="flex items-center gap-2">
            <Upload size={16} />
            Attach files
          </span>
        </label>
        <input
          id={id}
          type="file"
          multiple
          disabled={disabled}
          className="mt-2 block w-full min-w-0 text-xs"
          accept=".png,.jpg,.jpeg,.webp,.pdf,.txt"
          onChange={(e) => {
            add(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Drop files here or choose files. Up to {maxFiles} files, {fileSize(maxBytes)} each. PNG,
          JPG, WEBP, PDF or TXT.
        </p>
      </div>
      {error && <InlineMessage error>{error}</InlineMessage>}
      {files.map((f, i) => (
        <div
          key={`${f.name}-${i}`}
          className="flex items-center gap-3 rounded-lg border border-border p-2"
        >
          <Preview file={f} />
          <div className="min-w-0 flex-1">
            <p className="break-all text-sm">{f.name}</p>
            <p className="text-xs text-muted-foreground">{fileSize(f.size)}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove selected ${f.name}`}
            disabled={disabled}
            onClick={() => onChange(files.filter((_, n) => n !== i))}
          >
            <Trash2 size={16} />
          </Button>
        </div>
      ))}
    </div>
  );
}
export function UploadProgress({ progress, onCancel }: { progress: number; onCancel: () => void }) {
  return (
    <div className="space-y-2" role="status">
      <p className="text-xs">
        {progress === 100 ? 'Saving files and message…' : `Uploading ${progress}%`}
      </p>
      <progress
        className="w-full accent-violet-500"
        value={progress}
        max={100}
        aria-label="Upload progress"
      />
      <Button type="button" size="sm" variant="outline" onClick={onCancel}>
        Cancel upload
      </Button>
    </div>
  );
}
export function AttachmentList({ items }: { items: Attachment[] }) {
  const mutation = useApiMutation();
  const [deleting, setDeleting] = useState<Attachment | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  return (
    <div className="space-y-2">
      {items.map((a) => (
        <div
          key={a.id}
          className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3"
        >
          <FileText className="shrink-0 text-primary" size={18} />
          <div className="min-w-0 flex-1">
            <p className="break-all text-sm font-medium">{a.originalFilename}</p>
            <p className="text-xs text-muted-foreground">
              {fileSize(a.fileSize)} · {a.uploaderName} · {formatDate(a.createdAt, true)}
              {a.isInternal ? ' · Internal' : ''}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={`Download ${a.originalFilename}`}
            disabled={busy === a.id}
            onClick={async () => {
              setBusy(a.id);
              setError('');
              try {
                await downloadAttachment(a.id, a.originalFilename);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(null);
              }
            }}
          >
            <Download size={16} />
          </Button>
          {a.canDelete && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Delete ${a.originalFilename}`}
              onClick={() => {
                mutation.reset();
                setDeleting(a);
              }}
            >
              <Trash2 size={16} />
            </Button>
          )}
        </div>
      ))}
      {error && <InlineMessage error>{error}</InlineMessage>}
      {message && <InlineMessage>{message}</InlineMessage>}
      <Dialog
        open={!!deleting}
        onOpenChange={(v) => {
          if (!v && !mutation.isPending) setDeleting(null);
        }}
        title="Delete attachment"
        description={`Remove ${deleting?.originalFilename ?? 'this file'}? Downloads will no longer be available. The ticket and conversation remain in history.`}
        className="max-h-[85dvh] overflow-y-auto"
      >
        {mutation.error && <InlineMessage error>{mutation.error.message}</InlineMessage>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={mutation.isPending} onClick={() => setDeleting(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={mutation.isPending}
            onClick={async () => {
              try {
                await mutation.mutateAsync({
                  path: `/attachments/${deleting!.id}`,
                  method: 'DELETE',
                  body: {},
                });
                setDeleting(null);
                setMessage('Attachment deleted.');
              } catch {
                /* Keep confirmation open with its error. */
              }
            }}
          >
            Delete attachment
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
export function TicketAttachments({ ticketId }: { ticketId: string }) {
  const query = useApi<Attachment[]>(`/tickets/${ticketId}/attachments`);
  const mutation = useApiMutation();
  const [files, setFiles] = useState<File[]>([]),
    [progress, setProgress] = useState(0);
  const [submissionId, setSubmissionId] = useState(() => crypto.randomUUID());
  const [controller, setController] = useState<AbortController | null>(null);
  const [message, setMessage] = useState('');
  return (
    <Card title="Ticket attachments">
      <div className="space-y-4 px-6 pb-6">
        <QueryState query={query} />
        <AttachmentList items={query.data?.filter((a) => !a.commentId) ?? []} />
        {query.data && !query.data.some((a) => !a.commentId) && (
          <p className="text-sm text-muted-foreground">No ticket attachments yet.</p>
        )}
        <p className="text-xs text-muted-foreground">
          Ticket uploads are public to authorized participants. Use an internal note for private
          support files.
        </p>
        <FilePicker
          files={files}
          disabled={mutation.isPending}
          onChange={(value) => {
            setFiles(value);
            setSubmissionId(crypto.randomUUID());
            setMessage('');
          }}
        />
        {mutation.error && <InlineMessage error>{mutation.error.message}</InlineMessage>}
        {message && <InlineMessage>{message}</InlineMessage>}
        {mutation.isPending && (
          <UploadProgress progress={progress} onCancel={() => controller?.abort()} />
        )}
        <Button
          disabled={!files.length || mutation.isPending}
          onClick={async () => {
            const cancel = new AbortController();
            setController(cancel);
            setProgress(0);
            try {
              await mutation.mutateAsync({
                path: `/tickets/${ticketId}/attachments`,
                body: uploadForm({}, files, submissionId),
                onProgress: setProgress,
                signal: cancel.signal,
              });
              setFiles([]);
              setSubmissionId(crypto.randomUUID());
              setMessage('Attachments saved.');
            } catch {
              /* Retain files and submission identifier for retry. */
            }
          }}
        >
          Upload attachments
        </Button>
      </div>
    </Card>
  );
}
