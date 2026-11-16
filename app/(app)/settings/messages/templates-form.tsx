'use client'

import { useActionState, useState } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Field, FormError, SubmitButton } from '@/components/form'
import { fillTemplate, MESSAGE_DOCS } from '@/lib/messages'
import { saveTemplates } from './actions'

const EXAMPLE: Record<string, string> = {
  client: 'Sharma Enterprises', doc_no: 'INV-0042', date: '15 Nov 2026', amount: '₹11,348.00', balance: '₹3,348.00',
  travel: 'DEL-BOM on 20 Nov 2026, PNR ABC123', due_date: ', due 30 Nov 2026', package: 'Kerala Backwaters 5N/6D',
  valid_until: ', valid until 30 Nov 2026', company: 'Your company',
}

export function TemplatesForm({ bodies, company }: { bodies: Record<string, string>; company: string }) {
  const [state, action] = useActionState(saveTemplates, undefined)
  const [text, setText] = useState(bodies)
  return (
    <form action={action} className="grid gap-6">
      {MESSAGE_DOCS.map((d) => (
        <section key={d.key} className="grid gap-4 rounded-3xl bg-card p-5 md:grid-cols-2 md:p-6">
          <Field label={d.label} htmlFor={d.key} hint={`Placeholders: ${d.vars.map((v) => `{${v}}`).join(' ')}`}>
            <Textarea id={d.key} name={d.key} rows={8} value={text[d.key]} onChange={(e) => setText((t) => ({ ...t, [d.key]: e.target.value }))} maxLength={2000} />
          </Field>
          <div className="grid content-start gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">Preview</p>
            <p className="rounded-2xl rounded-tl-sm bg-tile-green/15 px-4 py-3 text-sm whitespace-pre-line">{fillTemplate(text[d.key] ?? '', { ...EXAMPLE, company })}</p>
          </div>
        </section>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>Save messages</SubmitButton>
        {state && 'saved' in state && state.saved && <span className="text-sm text-primary">Saved</span>}
      </div>
      <FormError state={state} />
    </form>
  )
}
