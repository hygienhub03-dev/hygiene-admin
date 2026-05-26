"use client"

import { useState, useEffect, Suspense } from "react"
import Image from "next/image"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Mail, ArrowRight, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"

function EmailConfirmationContent() {
  const searchParams = useSearchParams()
  const email = searchParams.get("email") || "your email"
  const [isResending, setIsResending] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [resendCooldown])

  const handleResend = async () => {
    setIsResending(true)

    const supabase = createSupabaseBrowserClient()
    await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    setIsResending(false)
    setResendCooldown(60) // 60 second cooldown
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-muted" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[var(--color-accent)]/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/5 rounded-full blur-[120px]" />
        
        <div className="relative z-10 flex flex-col justify-center items-center w-full p-12">
          <div className="max-w-md text-center">
            <div className="mb-8">
              <Image
                src="/hygiene-hub-logo.png"
                alt="Hygiene Hub Logo"
                width={280}
                height={280}
                className="mx-auto"
                priority
              />
            </div>
            
            <h1 className="text-3xl font-bold text-foreground mb-4">
              Almost There!
            </h1>
            <p className="text-muted-foreground text-lg leading-relaxed">
              Just one more step to access your Hygiene Hub admin dashboard.
            </p>
          </div>
        </div>
      </div>

      {/* Right side - Confirmation */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden mb-8 flex justify-center">
            <Image
              src="/hygiene-hub-logo.png"
              alt="Hygiene Hub Logo"
              width={180}
              height={180}
              priority
            />
          </div>

          {/* Confirmation card */}
          <div className="bg-card border border-border rounded-lg p-8 shadow-sm text-center">
            {/* Icon */}
            <div className="w-20 h-20 bg-[var(--color-accent)]/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <Mail className="h-10 w-10 text-[var(--color-accent)]" />
            </div>

            <h2 className="text-2xl font-semibold text-foreground mb-2">
              Check your email
            </h2>
            
            <p className="text-muted-foreground mb-2">
              We&apos;ve sent a confirmation link to
            </p>
            <p className="font-medium text-foreground mb-6">
              {email}
            </p>

            <div className="bg-muted/50 rounded-lg p-4 mb-6">
              <p className="text-sm text-muted-foreground">
                Click the link in the email to verify your account and complete your registration.
              </p>
            </div>

            {/* Action buttons */}
            <div className="space-y-3">
              <Button
                onClick={handleResend}
                disabled={isResending || resendCooldown > 0}
                variant="outline"
                className="w-full h-10 border-border"
              >
                {isResending ? (
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Sending...</span>
                  </div>
                ) : resendCooldown > 0 ? (
                  <span>Resend in {resendCooldown}s</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" />
                    <span>Resend email</span>
                  </div>
                )}
              </Button>

              <Link href="/login" className="block">
                <Button
                  className="w-full h-10 bg-[var(--color-accent)] text-foreground hover:bg-[var(--color-accent)]/90 font-medium rounded-md transition-all duration-200"
                >
                  <span>Go to login</span>
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            </div>

            {/* Help text */}
            <div className="mt-6 pt-6 border-t border-border">
              <p className="text-sm text-muted-foreground">
                Didn&apos;t receive the email? Check your spam folder or{" "}
                <Link 
                  href="/support"
                  className="text-[var(--color-accent)] hover:opacity-80 transition-opacity"
                >
                  contact support
                </Link>
              </p>
            </div>
          </div>

          {/* Tips */}
          <div className="mt-6 bg-card border border-border rounded-lg p-4">
            <h3 className="text-sm font-medium text-foreground mb-2">Tips:</h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>- Check your spam or junk folder</li>
              <li>- Make sure {email} is correct</li>
              <li>- The link expires in 24 hours</li>
            </ul>
          </div>

          {/* Copyright */}
          <p className="mt-8 text-center text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Hygiene Hub Skincare. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function EmailConfirmationPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[var(--color-accent)]/30 border-t-[var(--color-accent)] rounded-full animate-spin" />
      </div>
    }>
      <EmailConfirmationContent />
    </Suspense>
  )
}
