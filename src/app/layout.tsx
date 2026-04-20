import type { Metadata } from 'next'
import '@/styles/globals.css'
import './leaflet-overrides.css'
import styles from './layout.module.css'

const site = 'https://ttc-live.cindehaa.com'

export const metadata: Metadata = {
  title: 'TTC Streetcar Tracker',
  description: 'Live Toronto streetcar locations updated in real time.',
  metadataBase: new URL(site),
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
  },
  openGraph: {
    title: 'TTC Streetcar Tracker',
    description: 'Live Toronto streetcar locations updated in real time.',
    url: site,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className={styles.root}>{children}</div>
      </body>
    </html>
  )
}
