import { getContext } from '@/lib/context'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { MESSAGE_DOCS, templateFor } from '@/lib/messages'
import { TemplatesForm } from './templates-form'
import { resetTemplates } from './actions'

export const metadata = { title: 'WhatsApp messages' }

export default async function MessagesPage() {
  const { supabase, org } = await getContext()
  const { data } = await supabase.from('message_templates').select('doc_type, body').eq('org_id', org.id).eq('channel', 'whatsapp')
  const bodies = Object.fromEntries(MESSAGE_DOCS.map((d) => [d.key, templateFor(data, d.key)]))
  return (
    <>
      <PageHeader
        title="WhatsApp messages"
        description="The text that opens in WhatsApp when you press WhatsApp on an invoice, receipt or quotation. Download the PDF and attach it in the chat."
        actions={<form action={resetTemplates}><Button type="submit" variant="outline">Restore defaults</Button></form>}
      />
      <TemplatesForm bodies={bodies} company={org.name} />
    </>
  )
}
