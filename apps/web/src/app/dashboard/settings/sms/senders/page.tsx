import { redirect } from 'next/navigation';

export default function DashboardSmsSendersRedirect() {
  // Redirect to the actual page in the (dashboard) route group
  // This ensures the page uses the proper dashboard layout with sidebar and header
  redirect('/settings/sms/senders');
}
