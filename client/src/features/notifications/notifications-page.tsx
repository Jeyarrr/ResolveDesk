import { Card, EmptyState, PageHeader } from '../../components/shared/primitives';
export default function NotificationsPage() {
  return (
    <>
      <PageHeader
        eyebrow="STAY IN THE LOOP"
        title="Notifications"
        description="Notification delivery is planned for a later phase."
      />
      <Card title="Your updates">
        <EmptyState
          title="Notifications are not yet available"
          description="Open a ticket to see its saved conversation and activity history. Real-time, email, and desktop notifications are not enabled."
        />
      </Card>
    </>
  );
}
