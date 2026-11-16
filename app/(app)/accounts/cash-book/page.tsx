import { Statement } from '@/components/statement'

export const metadata = { title: 'Cash book' }

export default async function Page({ searchParams }: { searchParams: Promise<{ ledger?: string; from?: string; to?: string }> }) {
  return <Statement title="Cash book" kinds={['cash']} sp={await searchParams} />
}
