import { InlineMessage, Loading } from './primitives';
import { Button } from '../ui/button';
export function QueryState({
  query,
}: {
  query: { isPending: boolean; error: Error | null; refetch: () => unknown };
}) {
  if (query.isPending) return <Loading />;
  if (query.error)
    return (
      <InlineMessage error>
        {query.error.message}{' '}
        <Button variant="outline" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </InlineMessage>
    );
  return null;
}
