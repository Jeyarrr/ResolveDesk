import { Card, PageHeader } from '../../components/shared/primitives';
import { NotificationList } from './notification-center';
export default function NotificationsPage() {
  return (
    <>
      <PageHeader
        eyebrow="YOUR SUPPORT UPDATES"
        title="Notifications"
        description="Persistent updates for your authorized tickets."
      />
      <Card title="Notification history">
        <div className="px-6 pb-6">
          <NotificationList />
        </div>
      </Card>
    </>
  );
}
