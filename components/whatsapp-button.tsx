import { MessageCircle } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { waLink, waNumber } from '@/lib/messages'
import { cn } from '@/lib/utils'

/** Opens WhatsApp (app or web) with the message typed in; the user presses send there. */
export function WhatsAppButton({ phone, text, label = 'WhatsApp', size, className }: { phone: string | null | undefined; text: string; label?: string; size?: 'sm' | 'icon-sm'; className?: string }) {
  return (
    <a
      href={waLink(phone, text)}
      target="_blank"
      rel="noopener noreferrer"
      title={waNumber(phone) ? `Message ${phone} on WhatsApp` : 'No mobile number saved: WhatsApp will ask whom to send to'}
      className={cn(buttonVariants({ variant: 'outline', size }), className)}
    >
      <MessageCircle /> {size !== 'icon-sm' && label}
    </a>
  )
}
