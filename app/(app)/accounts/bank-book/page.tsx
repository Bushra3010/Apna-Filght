import { Statement } from '@/components/statement'

export const metadata = { title: 'Bank book' }

export default async function Page({ searchParams }: { searchParams: Promise<{ ledger?: string; from?: string; to?: string }> }) {
  return <Statement title="Bank book" kinds={['bank']} sp={await searchParams} />
}
