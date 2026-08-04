import Link from "next/link";
import { Settings } from "lucide-react";
import { getNotifications } from "@/actions/notifications";
import { NotificationFeed } from "./notification-feed";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  // The first page is server-rendered; the client component takes over for
  // "load more" and for marking rows read.
  const initial = await getNotifications({ limit: 20 });

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Notifications</h1>
        <Link
          href="/profile#notifications"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <Settings className="h-4 w-4" />
          Notification settings
        </Link>
      </div>

      <NotificationFeed initial={initial} />
    </div>
  );
}
