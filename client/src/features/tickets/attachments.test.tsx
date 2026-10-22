import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AttachmentList, FilePicker } from './attachments';
import { TicketConversation } from './ticket-conversation';
import type { Attachment } from '../../services/contracts';

const mocks = vi.hoisted(() => ({ mutateAsync: vi.fn(), download: vi.fn(), role: 'agent' }));
vi.mock('../../app/context', () => ({ useApp: () => ({ user: { role: mocks.role } }) }));
vi.mock('../../services/api', () => ({
  downloadAttachment: mocks.download,
  api: vi.fn().mockResolvedValue({}),
}));
vi.mock('../../hooks/use-api', () => ({
  useApiMutation: () => ({
    mutateAsync: mocks.mutateAsync,
    reset: vi.fn(),
    error: null,
    isPending: false,
  }),
  useApi: (path: string) => ({
    data:
      path === '/attachment-limits'
        ? { maxFiles: 5, maxFileBytes: 1024 }
        : path.startsWith('/response-templates')
          ? {
              total: 1,
              items: [
                {
                  id: 'template',
                  title: 'Printer check',
                  body: 'Please reconnect the printer to Wi-Fi.',
                },
              ],
            }
          : undefined,
    error: null,
    isPending: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));
beforeEach(() => {
  mocks.role = 'agent';
  mocks.mutateAsync.mockReset().mockResolvedValue({});
  mocks.download.mockReset().mockResolvedValue(undefined);
});
function Picker() {
  const [files, setFiles] = useState<File[]>([]);
  return <FilePicker files={files} onChange={setFiles} />;
}
describe('attachment and conversation controls', () => {
  it('selects and removes files and validates empty or oversized selection', async () => {
    render(<Picker />);
    const user = userEvent.setup();
    await user.upload(
      screen.getByLabelText('Attach files'),
      new File(['Printer error'], 'report.txt', { type: 'text/plain' }),
    );
    expect(screen.getByText('report.txt')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Remove selected report.txt' }));
    expect(screen.queryByText('report.txt')).not.toBeInTheDocument();
    await user.upload(
      screen.getByLabelText('Attach files'),
      new File([], 'empty.txt', { type: 'text/plain' }),
    );
    expect(screen.getByText(/Files must be nonempty/)).toBeVisible();
    await user.upload(
      screen.getByLabelText('Attach files'),
      new File(['a'.repeat(1025)], 'large.txt', { type: 'text/plain' }),
    );
    expect(screen.getByText(/at most 1 KB/)).toBeVisible();
  });
  it('requires delete confirmation, supports cancellation and reports download failures', async () => {
    render(
      <AttachmentList
        items={[
          {
            id: 'file',
            originalFilename: 'report.txt',
            canDelete: true,
            fileSize: 100,
            uploaderName: 'Mon',
            createdAt: new Date().toISOString(),
          } as Attachment,
        ]}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Delete report.txt' }));
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    mocks.download.mockRejectedValueOnce(new Error('Attachment file is unavailable'));
    await user.click(screen.getByRole('button', { name: 'Download report.txt' }));
    expect(await screen.findByText('Attachment file is unavailable')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Delete report.txt' }));
    await user.click(screen.getByRole('button', { name: 'Delete attachment' }));
    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      path: '/attachments/file',
      method: 'DELETE',
      body: {},
    });
  });
  it('inserts a saved reply for editing without sending and posts through the existing comments endpoint', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TicketConversation ticketId="ticket" />
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Insert saved reply'), 'template');
    expect(screen.getByLabelText('Add a reply')).toHaveValue(
      'Please reconnect the printer to Wi-Fi.',
    );
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
    await user.click(screen.getByLabelText('Internal note (support staff only)'));
    await user.click(screen.getByRole('button', { name: 'Post internal note' }));
    expect(mocks.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/tickets/ticket/comments',
        body: expect.objectContaining({
          isInternal: true,
          message: 'Please reconnect the printer to Wi-Fi.',
        }),
      }),
    );
  });
  it('hides internal-note and template controls for employees', () => {
    mocks.role = 'employee';
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TicketConversation ticketId="ticket" />
      </QueryClientProvider>,
    );
    expect(screen.queryByLabelText('Internal note (support staff only)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Insert saved reply')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Post reply' })).toBeDisabled();
  });
});
