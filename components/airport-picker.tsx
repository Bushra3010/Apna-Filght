'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { AIRPORTS, airportCity } from '@/lib/flights'
import { cn } from '@/lib/utils'

/**
 * City / airport box you can type in: shows a short list that narrows as you type.
 * `value` is the IATA code ('' when nothing is chosen). Any 3-letter code can be typed for an airport not in the list.
 */
export function AirportPicker({ id, value, onChange, placeholder = 'Type a city' }: { id: string; value: string; onChange: (code: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [at, setAt] = useState(0)

  const q = text.trim().toLowerCase()
  const matches: (readonly [string, string])[] = q
    ? AIRPORTS.filter(([code, city]) => city.toLowerCase().includes(q) || code.toLowerCase().startsWith(q))
        // cities that start with what was typed come first
        .sort((a, b) => Number(b[1].toLowerCase().startsWith(q)) - Number(a[1].toLowerCase().startsWith(q)))
    : [...AIRPORTS]
  const typedCode = /^[a-z]{3}$/.test(q) && !AIRPORTS.some(([c]) => c.toLowerCase() === q) ? q.toUpperCase() : null
  const options: (readonly [string, string])[] = typedCode ? [...matches, [typedCode, 'Other airport']] : matches

  const pick = (code: string) => {
    onChange(code)
    setOpen(false)
    setText('')
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        autoComplete="off"
        className="pl-9"
        placeholder={placeholder}
        value={open ? text : value ? `${airportCity(value)} (${value})` : ''}
        onFocus={(e) => { setOpen(true); setText(''); setAt(0); e.currentTarget.select() }}
        onBlur={() => setOpen(false)}
        onChange={(e) => { setText(e.target.value); setAt(0); setOpen(true) }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setAt((i) => Math.min(i + 1, options.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setAt((i) => Math.max(i - 1, 0)) }
          else if (e.key === 'Enter' && open) { e.preventDefault(); if (options[at]) pick(options[at][0]) }
          else if (e.key === 'Escape') setOpen(false)
        }}
      />
      {open && (
        <ul id={`${id}-list`} role="listbox" className="absolute z-30 mt-1 max-h-60 w-full min-w-52 overflow-y-auto rounded-2xl border border-border bg-popover p-1 text-sm shadow-xl">
          {options.length === 0 && <li className="px-3 py-2 text-muted-foreground">No city found. Type the 3-letter airport code.</li>}
          {options.map(([code, city], i) => (
            <li
              key={code}
              role="option"
              aria-selected={code === value}
              // mousedown, not click: the input's blur would close the list before a click lands
              onMouseDown={(e) => { e.preventDefault(); pick(code) }}
              onMouseEnter={() => setAt(i)}
              className={cn('flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2', i === at && 'bg-accent', code === value && 'font-semibold text-primary')}
            >
              <span>{city}</span>
              <span className="text-xs text-muted-foreground">{code}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
