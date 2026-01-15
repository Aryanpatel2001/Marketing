import Link from 'next/link';
import { redirect } from 'next/navigation';

interface Props {
  searchParams?: { [key: string]: string | undefined };
}

export default function SettingsIndexPage({ searchParams }: Props) {
  // Support a redirect query param used by the campaign "Create Sender ID" link
  const redirectTo = searchParams?.redirectTo;
  if (redirectTo === 'sms-senders' || redirectTo === 'sender-ids') {
    redirect('/settings/sms/senders');
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="text-muted-foreground">Manage your account and workspace settings.</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        <Link href="/settings/sms/senders" className="rounded-lg border p-4 hover:shadow">
          <h3 className="text-lg font-medium">Sender IDs</h3>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage SMS sender IDs for your tenant.
          </p>
        </Link>

        <Link href="/settings/billing" className="rounded-lg border p-4 hover:shadow">
          <h3 className="text-lg font-medium">Billing</h3>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage your subscription and credits.
          </p>
        </Link>

        <div className="rounded-lg border p-4 opacity-70">
          <h3 className="text-lg font-medium">API Keys</h3>
          <p className="text-muted-foreground mt-1 text-sm">Manage API keys (coming soon).</p>
        </div>
      </div>
    </div>
  );
}
