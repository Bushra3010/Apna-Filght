import Link from 'next/link'
import type { VariantProps } from 'class-variance-authority'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function LinkButton({
  href,
  variant,
  size,
  className,
  children,
  external,
}: { href: string; className?: string; children: React.ReactNode; /** a file or route handler (PDF): plain link in a new tab */ external?: boolean } & VariantProps<typeof buttonVariants>) {
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener" className={cn(buttonVariants({ variant, size }), className)}>
        {children}
      </a>
    )
  }
  return (
    <Link href={href} className={cn(buttonVariants({ variant, size }), className)}>
      {children}
    </Link>
  )
}
