import { redirect } from 'next/navigation';

export default function DashboardSettingsFallback() {
  // Ensure /dashboard/settings resolves even if the grouped route isn't picked up
  redirect('/dashboard/settings/sms/senders');
}
