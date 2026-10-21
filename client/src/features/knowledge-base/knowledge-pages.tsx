import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowUpRight, BookOpen, Clock3, Search, Sparkles } from 'lucide-react';
import { knowledgeService } from '../../services/knowledge';
import { categories } from '../../types/domain';
import { Button } from '../../components/ui/button';
import {
  Card,
  EmptyState,
  InlineMessage,
  Loading,
  PageHeader,
} from '../../components/shared/primitives';
import { formatDate } from '../../lib/utils';

export function KnowledgePage() {
  const {
    data: articles,
    isPending,
    isError,
    refetch,
  } = useQuery({ queryKey: ['knowledge'], queryFn: knowledgeService.list });
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  if (isPending) return <Loading label="Loading helpful guides…" />;
  if (isError)
    return (
      <InlineMessage error>
        We couldn't load the articles.{' '}
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          Try again
        </Button>
      </InlineMessage>
    );
  const filtered = articles.filter(
    (article) =>
      `${article.title} ${article.summary}`.toLowerCase().includes(search.toLowerCase()) &&
      (!category || article.category === category),
  );
  return (
    <>
      <PageHeader
        eyebrow="A LITTLE KNOWLEDGE GOES A LONG WAY"
        title="How can we help?"
        description="Practical guides and useful answers from your IT team. Sample articles for this demo."
        actions={
          <Button asChild variant="outline">
            <Link to="/tickets/new">
              Still need help?
              <ArrowUpRight />
            </Link>
          </Button>
        }
      />
      <div className="knowledge-search">
        <BookOpen size={30} className="text-primary" />
        <h2>Find your next step.</h2>
        <p>Search common issues, how-to guides, and helpful tips.</p>
        <div className="search-input">
          <Search size={18} />
          <input
            aria-label="Search articles"
            placeholder="Try VPN, email, or printer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="category-pills" aria-label="Article categories">
        {['', ...categories].map((value) => (
          <button
            key={value}
            aria-pressed={category === value}
            className={category === value ? 'selected' : ''}
            onClick={() => setCategory(value)}
          >
            {value || 'All articles'}
          </button>
        ))}
      </div>
      <div className="article-grid">
        {filtered.map((article) => (
          <Link to={`/knowledge/${article.id}`} className="article-card" key={article.id}>
            <div className="flex items-center justify-between">
              <span className="article-icon">
                <BookOpen size={20} />
              </span>
              {article.featured && (
                <span className="flex items-center gap-1 text-[10px] font-medium text-primary">
                  <Sparkles size={12} />
                  FEATURED
                </span>
              )}
            </div>
            <span className="eyebrow mt-6 block">{article.category}</span>
            <h2>{article.title}</h2>
            <p>{article.summary}</p>
            <div className="article-card-footer">
              <span>
                <Clock3 size={13} />
                {article.readMinutes} min read
              </span>
              <ArrowUpRight size={17} />
            </div>
          </Link>
        ))}
      </div>
      {!filtered.length && (
        <EmptyState
          title="No articles found"
          description="Try another search or explore a different category."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setSearch('');
                setCategory('');
              }}
            >
              Clear filters
            </Button>
          }
        />
      )}
    </>
  );
}
export function ArticlePage() {
  const { id } = useParams();
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['knowledge'],
    queryFn: knowledgeService.list,
  });
  if (isPending) return <Loading />;
  if (isError)
    return (
      <InlineMessage error>
        Articles could not be loaded.{' '}
        <Button size="sm" onClick={() => void refetch()}>
          Retry
        </Button>
      </InlineMessage>
    );
  const article = data.find((a) => a.id === id);
  if (!article)
    return (
      <EmptyState
        title="Article not found"
        description="Explore the knowledge base to find another guide."
        action={
          <Button asChild>
            <Link to="/knowledge">Browse articles</Link>
          </Button>
        }
      />
    );
  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/knowledge" className="back-link">
        <ArrowLeft size={14} />
        Knowledge base
      </Link>
      <PageHeader
        eyebrow={article.category.toUpperCase()}
        title={article.title}
        description={`${article.readMinutes} min read · Updated ${formatDate(article.updatedAt)} · Sample guide`}
      />
      <Card>
        <article className="article-content">
          <p className="article-intro">{article.summary}</p>
          {article.sections.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </section>
          ))}
          <div className="mt-8 border-t border-border pt-6">
            <h2>Need a hand?</h2>
            <p>Share the details with your IT support team.</p>
            <Button asChild className="mt-4">
              <Link to="/tickets/new">
                Create a ticket
                <ArrowUpRight />
              </Link>
            </Button>
          </div>
        </article>
      </Card>
    </div>
  );
}
