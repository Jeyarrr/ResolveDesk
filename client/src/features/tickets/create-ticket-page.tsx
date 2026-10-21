import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight, BookOpen, LoaderCircle } from 'lucide-react';
import { useApp } from '../../app/context';
import { priorities } from '../../types/domain';
import { useApi, useApiMutation } from '../../hooks/use-api';
import { priorityValue, type Reference } from '../../services/contracts';
import { QueryState } from '../../components/shared/query-state';
import { createTicketSchema, type CreateTicketInput } from './schema';
import { Button } from '../../components/ui/button';
import { Card, FieldError, InlineMessage, PageHeader } from '../../components/shared/primitives';
import { errorMessage } from '../../lib/utils';

export default function CreateTicketPage() {
  const { user } = useApp();
  const navigate = useNavigate();
  const categories = useApi<Reference[]>('/ticket-categories');
  const mutation = useApiMutation<{ id: string }>();
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateTicketInput>({
    resolver: zodResolver(createTicketSchema),
    defaultValues: { subject: '', description: '', category: '', priority: 'Medium' },
  });
  if (!user) return null;
  if (user.role === 'agent')
    return (
      <InlineMessage>
        Agents manage assigned requests. Contact your administrator to submit a ticket.
      </InlineMessage>
    );
  if (!categories.data) return <QueryState query={categories} />;
  return (
    <>
      <Link to="/tickets/mine" className="back-link">
        <ArrowLeft size={14} />
        Back to my tickets
      </Link>
      <PageHeader
        eyebrow="WE'RE HERE TO HELP"
        title="Create a support ticket"
        description="A few details now help your IT team find the right solution faster."
      />
      <div className="form-layout">
        <Card title="Tell us what's happening" subtitle="Fields marked with * are required.">
          <form
            className="p-6 pt-1 space-y-6"
            noValidate
            onSubmit={handleSubmit(async (values) => {
              setError('');
              try {
                const ticket = await mutation.mutateAsync({
                  path: '/tickets',
                  body: {
                    subject: values.subject,
                    description: values.description,
                    categoryId: values.category,
                    priority: priorityValue(values.priority),
                  },
                });
                navigate(`/tickets/${ticket.id}`, { state: { created: true } });
              } catch (e) {
                setError(errorMessage(e));
              }
            })}
          >
            <div>
              <label htmlFor="subject" className="label">
                Subject <span aria-hidden="true">*</span>
              </label>
              <input
                id="subject"
                className="input"
                placeholder="A short summary of the issue"
                maxLength={120}
                {...register('subject')}
                aria-required="true"
                aria-invalid={!!errors.subject}
                aria-describedby="subject-error"
              />
              <FieldError id="subject-error" message={errors.subject?.message} />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="category" className="label">
                  Category <span aria-hidden="true">*</span>
                </label>
                <select
                  id="category"
                  className="select w-full"
                  aria-required="true"
                  {...register('category')}
                >
                  <option value="">Select a category</option>
                  {categories.data
                    .filter((c) => c.active)
                    .map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                </select>
                <FieldError id="category-error" message={errors.category?.message} />
              </div>
              <div>
                <label htmlFor="priority" className="label">
                  Priority <span aria-hidden="true">*</span>
                </label>
                <select
                  id="priority"
                  className="select w-full"
                  aria-required="true"
                  {...register('priority')}
                >
                  {priorities.map((priority) => (
                    <option key={priority}>{priority}</option>
                  ))}
                </select>
                <FieldError id="priority-error" message={errors.priority?.message} />
              </div>
            </div>
            <div>
              <label htmlFor="description" className="label">
                Description <span aria-hidden="true">*</span>
              </label>
              <textarea
                id="description"
                rows={7}
                className="input resize-y"
                placeholder="What happened? What were you trying to do? Include any error messages and steps you've already tried."
                maxLength={5000}
                {...register('description')}
                aria-required="true"
                aria-invalid={!!errors.description}
                aria-describedby="description-error description-hint"
              />
              <p id="description-hint" className="mt-2 text-xs text-muted-foreground">
                Please leave out passwords, verification codes, and confidential information.
              </p>
              <FieldError id="description-error" message={errors.description?.message} />
            </div>
            <InlineMessage>
              Attachments are not available yet. Secure file storage is planned for a later phase.
            </InlineMessage>
            {error && <InlineMessage error>{error}</InlineMessage>}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
              <span className="text-xs text-muted-foreground">
                Your request will be saved to the support system.
              </span>
              <div className="flex gap-2">
                <Button asChild variant="outline">
                  <Link to="/tickets/mine">Cancel</Link>
                </Button>
                <Button disabled={isSubmitting}>
                  {isSubmitting ? <LoaderCircle className="animate-spin" /> : null}Submit ticket
                  <ArrowRight />
                </Button>
              </div>
            </div>
          </form>
        </Card>
        <aside className="space-y-5">
          <Card title="A better ticket, a faster answer">
            <ol className="tips-list">
              <li>
                <span>1</span>
                <div>
                  <strong>Be specific</strong>
                  <p>Describe what you expected and what happened instead.</p>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <strong>Add useful context</strong>
                  <p>Include the device, application, and any error messages.</p>
                </div>
              </li>
              <li>
                <span>3</span>
                <div>
                  <strong>Choose the right priority</strong>
                  <p>Critical is for widespread or business-critical disruption.</p>
                </div>
              </li>
            </ol>
          </Card>
          <div className="help-card">
            <BookOpen size={24} />
            <h2>The answer might be here</h2>
            <p>Explore quick fixes and step-by-step guides in our knowledge base.</p>
            <Button asChild variant="outline">
              <Link to="/knowledge">
                Browse articles
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </aside>
      </div>
    </>
  );
}
