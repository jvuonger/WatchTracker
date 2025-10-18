import { prisma } from '@/lib/prisma';
import Link from 'next/link';

interface Params { brand: string; family: string; ref: string }

export default async function ModelPage({ params }: { params: Params }) {
  const { brand, ref } = params;
  const model = await prisma.model.findFirst({ where: { brand, ref } });
  if (!model) {
    return (
      <main>
        <h2>Model not found</h2>
        <p>
          <Link href="/">Go home</Link>
        </p>
      </main>
    );
  }
  const listings = await prisma.soldListing.findMany({
    where: { modelId: model.id },
    orderBy: { endTimeUtc: 'desc' },
    take: 50
  });

  return (
    <main>
      <h2 style={{ fontSize: 18, fontWeight: 600 }}>{model.displayName}</h2>
      <p style={{ color: '#666' }}>{brand} · {model.family ?? '—'} · {ref}</p>
      <h3 style={{ marginTop: 16 }}>Recent sold</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th align="left">Title</th>
            <th align="right">Price</th>
            <th align="left">End</th>
            <th align="left">Link</th>
          </tr>
        </thead>
        <tbody>
          {listings.map((l) => (
            <tr key={l.itemId}>
              <td style={{ padding: '6px 4px' }}>{l.title}</td>
              <td style={{ padding: '6px 4px', textAlign: 'right' }}>${l.priceUsd.toString()}</td>
              <td style={{ padding: '6px 4px' }}>{new Date(l.endTimeUtc).toLocaleDateString()}</td>
              <td style={{ padding: '6px 4px' }}><a href={l.url} target="_blank" rel="noreferrer">View</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

