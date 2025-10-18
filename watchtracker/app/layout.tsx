export const metadata = {
  title: 'WatchTracker',
  description: 'Sold comps and trends'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial, "Apple Color Emoji", "Segoe UI Emoji"' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '16px' }}>
          <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h1 style={{ fontSize: 20, fontWeight: 600 }}>WatchTracker</h1>
            <nav style={{ display: 'flex', gap: 12 }}>
              <a href="/">Home</a>
              <a href="/watchlist">Watchlist</a>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}

