import { Statement } from '@/components/statement'

export const metadata = { title: 'Ledger statement' }

export default async function Page({ searchParams }: { searchParams: Promise<{ ledger?: string; from?: string; to?: string }> }) {
  return <Statement title="Ledger statement" sp={await searchParams} />
}
