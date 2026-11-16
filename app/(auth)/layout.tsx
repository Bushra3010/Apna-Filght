import { Plane } from 'lucide-react'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-3 text-xl font-bold tracking-tight">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Plane className="size-5" />
          </span>
          Apna Flight
        </div>
        <div className="rounded-3xl bg-card p-8">{children}</div>
      </div>
    </main>
  )
}
