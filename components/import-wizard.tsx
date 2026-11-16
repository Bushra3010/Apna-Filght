'use client'

import { useActionState, useMemo, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { CheckCircle2, CircleAlert, CircleMinus, Download, FileUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FormError, NativeSelect } from '@/components/form'
import { downloadCsv, parseFile } from '@/lib/import/parse-file'
import { guessMapping, type ImportField } from '@/lib/import/fields'
import type { ImportResult } from '@/lib/import/server'
import { cn } from '@/lib/utils'

export type SavedMapping = { name: string; mapping: Record<string, string>; defaults: Record<string, unknown> }

/**
 * Upload a CSV / Excel file → match its columns to our fields → check every row on the server → import.
 * Only the mapped values are sent to the server, so large files stay small on the wire.
 */
export function ImportWizard({
  fields,
  action,
  saved,
  sample,
  children,
}: {
  fields: ImportField[]
  action: (state: ImportResult, form: FormData) => Promise<ImportResult>
  saved: SavedMapping[]
  /** a two-row example for the template download */
  sample: { file: string; rows: Record<string, string>[] }
  /** extra defaults (selects / checkboxes) rendered inside the form */
  children?: React.ReactNode
}) {
  const [state, run] = useActionState(action, undefined)
  const formRef = useRef<HTMLFormElement>(null)
  const [file, setFile] = useState<{ name: string; headers: string[]; rows: Record<string, string>[] } | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [mappingName, setMappingName] = useState('')
  const [readError, setReadError] = useState('')
  const [reading, setReading] = useState(false)
  // a result is only valid for the file + mapping it was checked against
  const [checkedKey, setCheckedKey] = useState('')

  const payload = useMemo(() => {
    if (!file) return ''
    const used = fields.filter((f) => mapping[f.key])
    return JSON.stringify({
      file_name: file.name,
      mapping_name: mappingName,
      mapping,
      rows: file.rows.map((r) => Object.fromEntries(used.map((f) => [f.key, r[mapping[f.key]] ?? '']))),
    })
  }, [file, mapping, mappingName, fields])
  const key = `${file?.name}|${JSON.stringify(mapping)}`

  async function onFile(f: File | undefined) {
    setReadError('')
    setFile(null)
    if (!f) return
    setReading(true)
    try {
      const parsed = await parseFile(f)
      if (!parsed.rows.length) throw new Error('No rows found under the header row')
      setFile({ name: f.name, ...parsed })
      // prefer a saved mapping whose columns are all in this file
      const fit = saved.find((s) => Object.values(s.mapping).every((h) => parsed.headers.includes(h)))
      if (fit) applySaved(fit, parsed.headers)
      else setMapping(guessMapping(parsed.headers, fields))
    } catch (e) {
      setReadError(e instanceof Error ? e.message : 'Could not read the file')
    } finally {
      setReading(false)
    }
  }

  function applySaved(s: SavedMapping, headers = file?.headers ?? []) {
    setMapping(Object.fromEntries(Object.entries(s.mapping).filter(([, h]) => headers.includes(h))))
    setMappingName(s.name)
    const form = formRef.current
    if (!form) return
    for (const [k, v] of Object.entries(s.defaults)) {
      const el = form.elements.namedItem(k)
      if (el instanceof HTMLSelectElement || el instanceof HTMLInputElement) {
        if (el.type === 'checkbox') (el as HTMLInputElement).checked = !!v
        else el.value = String(v ?? '')
      }
    }
  }

  const missing = fields.filter((f) => f.required && !mapping[f.key])
  const showResult = state?.rows && checkedKey === key
  const counts = showResult ? { ok: state.rows!.filter((r) => r.status === 'ok').length, skip: state.rows!.filter((r) => r.status === 'skip').length, error: state.rows!.filter((r) => r.status === 'error').length } : null

  return (
    <form ref={formRef} action={(fd) => { setCheckedKey(key); return run(fd) }} className="grid gap-6">
      <input type="hidden" name="payload" value={payload} />

      <section className="rounded-3xl bg-card p-5 md:p-6">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="CSV or Excel file (.csv, .xlsx)" htmlFor="file" className="min-w-64 flex-1">
            <Input id="file" type="file" accept=".csv,.xlsx,.txt" onChange={(e) => onFile(e.target.files?.[0])} />
          </Field>
          {saved.length > 0 && (
            <Field label="Saved format" htmlFor="saved" className="w-56">
              <NativeSelect id="saved" value={saved.some((s) => s.name === mappingName) ? mappingName : ''} onChange={(e) => { const s = saved.find((x) => x.name === e.target.value); if (s) applySaved(s) }}>
                <option value="">Choose…</option>
                {saved.map((s) => <option key={s.name}>{s.name}</option>)}
              </NativeSelect>
            </Field>
          )}
          <Button type="button" variant="outline" onClick={() => downloadCsv(sample.file, fields.map((f) => f.label), sample.rows.map((r) => fields.map((f) => r[f.key] ?? '')))}>
            <Download /> Sample file
          </Button>
        </div>
        {reading && <p className="mt-3 text-sm text-muted-foreground">Reading the file…</p>}
        {readError && <p role="alert" className="mt-3 text-sm text-destructive">{readError}</p>}
        {file && <p className="mt-3 text-sm text-muted-foreground"><FileUp className="mr-1 inline size-4" />{file.name}: {file.rows.length} row(s), {file.headers.length} column(s)</p>}
      </section>

      {file && (
        <section className="rounded-3xl bg-card p-5 md:p-6">
          <h2 className="mb-1 text-lg font-semibold">Match the columns</h2>
          <p className="mb-4 text-sm text-muted-foreground">We guessed from the column names. Fix anything that is wrong; fields marked * are needed.</p>
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
            {fields.map((f) => (
              <Field key={f.key} label={f.label} required={f.required} htmlFor={`m-${f.key}`}>
                <NativeSelect id={`m-${f.key}`} value={mapping[f.key] ?? ''} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                  className={cn(f.required && !mapping[f.key] && 'border-destructive')}>
                  <option value="">— not in file —</option>
                  {file.headers.map((h) => <option key={h} value={h}>{h}{file.rows[0]?.[h] ? ` (e.g. ${file.rows[0][h].slice(0, 24)})` : ''}</option>)}
                </NativeSelect>
              </Field>
            ))}
          </div>
        </section>
      )}

      <section className={cn('rounded-3xl bg-card p-5 md:p-6', !file && 'hidden')}>
        <h2 className="mb-4 text-lg font-semibold">Options</h2>
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
          {children}
          <Field label="Save this format as" htmlFor="mapping_name" hint="So the next file from the same source maps itself">
            <Input id="mapping_name" value={mappingName} onChange={(e) => setMappingName(e.target.value)} placeholder="e.g. Airline portal export" maxLength={60} />
          </Field>
        </div>
      </section>

      {file && (
        <div className="flex flex-wrap items-center gap-3">
          <Run mode="preview" disabled={missing.length > 0}>Check rows</Run>
          <Run mode="commit" disabled={missing.length > 0 || !counts || counts.ok === 0 || state?.mode === 'commit'} variant="default">Import {counts ? `${counts.ok} row(s)` : ''}</Run>
          {missing.length > 0 && <span className="text-sm text-destructive">Match {missing.map((f) => f.label).join(', ')} first</span>}
          {!counts && missing.length === 0 && <span className="text-sm text-muted-foreground">Check the rows first; nothing is saved until you import.</span>}
        </div>
      )}

      {checkedKey === key && <FormError state={state} />}

      {showResult && (
        <section className="rounded-3xl bg-card p-5 md:p-6">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold">{state.mode === 'commit' ? 'Imported' : 'Check result'}</h2>
            <span className="text-sm text-muted-foreground">{state.summary}</span>
          </div>
          <div className="max-h-[32rem] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                <tr><th className="py-2 pr-3 font-medium">Row</th><th className="py-2 pr-3 font-medium">Record</th><th className="py-2 font-medium">Result</th></tr>
              </thead>
              <tbody>
                {state.rows!.map((r) => (
                  <tr key={r.n} className="border-t border-border/60 align-top">
                    <td className="py-2 pr-3 tabular-nums text-muted-foreground">{r.n}</td>
                    <td className="py-2 pr-3">{r.label || '—'}</td>
                    <td className={cn('py-2', r.status === 'error' && 'text-destructive', r.status === 'skip' && 'text-muted-foreground')}>
                      {r.status === 'ok' ? <CheckCircle2 className="mr-1.5 inline size-4 text-primary" /> : r.status === 'skip' ? <CircleMinus className="mr-1.5 inline size-4" /> : <CircleAlert className="mr-1.5 inline size-4" />}
                      {r.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </form>
  )
}

function Run({ mode, disabled, variant = 'outline', children }: { mode: 'preview' | 'commit'; disabled?: boolean; variant?: 'outline' | 'default'; children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" name="mode" value={mode} variant={variant} disabled={disabled || pending}>
      {pending ? 'Working…' : children}
    </Button>
  )
}
