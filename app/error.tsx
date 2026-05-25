'use client'

import { useEffect } from 'react'

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => { console.error(error) }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <h2 className="text-xl font-semibold">Something went wrong</h2>
      <p className="text-muted-foreground mt-2">We encountered an unexpected error.</p>
      <button
        onClick={() => unstable_retry()}
        className="mt-4 rounded bg-primary px-4 py-2 text-primary-foreground"
      >
        Try again
      </button>
    </div>
  )
}
