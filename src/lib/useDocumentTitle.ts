import { useEffect } from 'react'

const BASE = 'Survivor Pool'

/** Names the tab per route, so history and tab-switching are readable. */
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${BASE}` : BASE
    return () => {
      document.title = BASE
    }
  }, [title])
}
