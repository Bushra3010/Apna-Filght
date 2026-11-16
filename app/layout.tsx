import type { Metadata } from 'next'
import { Geist_Mono, Manrope } from 'next/font/google'
import './globals.css'

const manrope = Manrope({ variable: '--font-manrope', subsets: ['latin'], weight: ['400', '500', '600', '700', '800'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: { default: 'Apna Flight', template: '%s · Apna Flight' },
  description: 'Travel ERP and CRM: leads, billing, GST and accounts.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en-IN" className={`dark ${manrope.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background">{children}</body>
    </html>
  )
}
