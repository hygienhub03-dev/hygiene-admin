import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <h2 className="text-xl font-semibold">Page Not Found</h2>
      <p className="text-muted-foreground mt-2">The page you're looking for doesn't exist.</p>
      <Link href="/" className="mt-4 text-primary underline">
        Return home
      </Link>
    </div>
  )
}
