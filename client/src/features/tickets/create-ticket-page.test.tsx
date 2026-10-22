import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppContext } from '../../app/context';
import { createSeed } from '../../data/seed';
import CreateTicketPage from './create-ticket-page';
describe('create-ticket form accessibility and validation', () => {
  it('connects labels, displays validation errors, and retains entered text', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    client.setQueryData(['protected', '/attachment-limits'], {
      maxFiles: 5,
      maxFileBytes: 10485760,
    });
    client.setQueryData(
      ['protected', '/ticket-categories'],
      [{ id: 'category', name: 'Hardware', active: true }],
    );
    render(
      <QueryClientProvider client={client}>
        <AppContext.Provider
          value={{
            user: createSeed().users[0]!,
            theme: 'dark',
            setTheme: vi.fn(),
            login: vi.fn(),
            logout: vi.fn(),
            isLoading: false,
            authError: null,
            retryAuth: vi.fn(),
          }}
        >
          <MemoryRouter>
            <CreateTicketPage />
          </MemoryRouter>
        </AppContext.Provider>
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Subject/), 'VPN');
    await user.click(screen.getByRole('button', { name: /Submit ticket/ }));
    await waitFor(() => expect(screen.getByText('Use at least 5 characters.')).toBeVisible());
    expect(screen.getByText('Add at least 20 characters so we can help.')).toBeVisible();
    expect(screen.getByLabelText(/Subject/)).toHaveValue('VPN');
    expect(screen.getByLabelText(/Subject/)).toHaveAttribute('aria-invalid', 'true');
  });
});
