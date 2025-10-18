import Link from 'next/link';

export default function HomePage() {
  return (
    <main>
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Welcome</h2>
        <p>Track sold comps and price trends for popular watch models.</p>
      </section>
      <section>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Quick Links</h3>
        <ul>
          <li><Link href="/api/health">API Health</Link></li>
        </ul>
      </section>
    </main>
  );
}

