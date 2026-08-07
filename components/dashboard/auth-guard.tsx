"use client"

import { useEffect, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/context/AuthContext"

export function AuthGuard({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login")
    }
  }, [user, isLoading, router])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground" />
      </div>
    )
  }

  if (!user) return null

  return <>{children}</>
}
