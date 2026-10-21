import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { EmptyState } from '../components/shared/primitives';
export default function NotFoundPage() {
  return (
    <EmptyState
      title="This page took a wrong turn"
      description="The page you're looking for doesn't exist in this workspace."
      action={
        <Button asChild>
          <Link to="/">Back to overview</Link>
        </Button>
      }
    />
  );
}
