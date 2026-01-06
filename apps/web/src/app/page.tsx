import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary" />
            <span className="text-xl font-bold">Marketing Platform</span>
          </div>

          <nav className="hidden md:flex items-center gap-6">
            <Link href="/features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Features
            </Link>
            <Link href="/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Pricing
            </Link>
            <Link href="/about" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              About
            </Link>
          </nav>

          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Login
            </Link>
            <Link
              href="/register"
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="relative overflow-hidden bg-gradient-subtle">
          <div className="absolute inset-0 bg-grid-pattern" />

          <div className="container relative py-24 md:py-32 lg:py-40">
            <div className="mx-auto max-w-3xl text-center">
              <div className="inline-flex items-center rounded-full border px-3 py-1 text-sm text-muted-foreground mb-6">
                <span className="mr-2 h-2 w-2 rounded-full bg-green-500" />
                Now with WhatsApp Integration
              </div>

              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
                Multi-Channel{' '}
                <span className="text-gradient">Marketing</span>{' '}
                Automation
              </h1>

              <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
                Create and manage Email, SMS, and WhatsApp campaigns from a single dashboard.
                Automate your marketing workflows and grow your business.
              </p>

              <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  href="/register"
                  className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-8 text-base font-medium text-primary-foreground shadow-lg hover:bg-primary/90 transition-all hover:shadow-xl"
                >
                  Start for Free
                </Link>
                <Link
                  href="/demo"
                  className="inline-flex h-12 items-center justify-center rounded-md border border-input bg-background px-8 text-base font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  Book a Demo
                </Link>
              </div>

              <p className="mt-4 text-sm text-muted-foreground">
                No credit card required. Free plan available.
              </p>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="container py-24">
          <div className="mx-auto max-w-2xl text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Everything you need for marketing success
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Powerful tools to create, automate, and analyze your marketing campaigns.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: 'Email Marketing',
                description: 'Create beautiful emails with our drag-and-drop editor. A/B test subjects and content.',
                icon: '✉️',
              },
              {
                title: 'SMS Campaigns',
                description: 'Reach customers directly with text messages. Track delivery and engagement.',
                icon: '📱',
              },
              {
                title: 'WhatsApp Business',
                description: 'Send template messages, media, and interactive buttons through WhatsApp.',
                icon: '💬',
              },
              {
                title: 'Marketing Automation',
                description: 'Build visual workflows to automate your campaigns based on user behavior.',
                icon: '⚡',
              },
              {
                title: 'Contact Management',
                description: 'Import, segment, and manage your contacts with custom fields and tags.',
                icon: '👥',
              },
              {
                title: 'Analytics & Reports',
                description: 'Track opens, clicks, conversions, and revenue with detailed analytics.',
                icon: '📊',
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="group relative rounded-xl border bg-card p-6 hover:shadow-lg transition-all card-hover"
              >
                <div className="text-4xl mb-4">{feature.icon}</div>
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA Section */}
        <section className="border-t bg-muted/30">
          <div className="container py-24">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Ready to grow your business?
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Join thousands of businesses using our platform to reach their customers.
              </p>
              <div className="mt-10">
                <Link
                  href="/register"
                  className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-8 text-base font-medium text-primary-foreground shadow-lg hover:bg-primary/90 transition-all"
                >
                  Get Started for Free
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t">
        <div className="container py-12">
          <div className="grid gap-8 md:grid-cols-4">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-8 rounded-lg bg-primary" />
                <span className="text-xl font-bold">Marketing Platform</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Multi-channel marketing automation for modern businesses.
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/features" className="hover:text-foreground transition-colors">Features</Link></li>
                <li><Link href="/pricing" className="hover:text-foreground transition-colors">Pricing</Link></li>
                <li><Link href="/integrations" className="hover:text-foreground transition-colors">Integrations</Link></li>
                <li><Link href="/changelog" className="hover:text-foreground transition-colors">Changelog</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/about" className="hover:text-foreground transition-colors">About</Link></li>
                <li><Link href="/blog" className="hover:text-foreground transition-colors">Blog</Link></li>
                <li><Link href="/careers" className="hover:text-foreground transition-colors">Careers</Link></li>
                <li><Link href="/contact" className="hover:text-foreground transition-colors">Contact</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link></li>
                <li><Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link></li>
                <li><Link href="/dpa" className="hover:text-foreground transition-colors">DPA</Link></li>
              </ul>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} Marketing Platform. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
