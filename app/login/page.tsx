"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, Lock, Mail, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { useAuth } from "@/context/AuthContext"

export default function LoginPage() {
  const router = useRouter()
  const { signIn } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    const { error: signInError } = await signIn(email, password)

    if (signInError) {
      setError(signInError.message || "Invalid email or password")
      setIsLoading(false)
      return
    }

    router.push("/")
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        {/* Subtle gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-muted" />
        
        {/* Decorative elements */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[var(--color-accent)]/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/5 rounded-full blur-[120px]" />
        
        {/* Content */}
        <div className="relative z-10 flex flex-col justify-center items-center w-full p-12">
          <div className="max-w-md text-center">
            {/* Logo */}
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
            
            {/* Welcome text */}
            <h1 className="text-3xl font-bold text-foreground mb-4">
              Admin Dashboard
            </h1>
            <p className="text-muted-foreground text-lg leading-relaxed">
              Manage your skincare products, track sales, and grow your business with powerful analytics.
            </p>
            
            {/* Feature highlights */}
            <div className="mt-12 space-y-4">
              {[
                "Real-time sales analytics",
                "Product inventory management",
                "Customer insights & reports"
              ].map((feature, index) => (
                <div 
                  key={index}
                  className="flex items-center justify-center gap-3 text-muted-foreground"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)]" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Login Form */}
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

          {/* Form card */}
          <div className="bg-card border border-border rounded-lg p-8 shadow-sm">
            <div className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-2">
                Welcome back
              </h2>
              <p className="text-muted-foreground">
                Sign in to your admin account
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Email field */}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-foreground text-sm font-medium">
                  Email address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@hygienehub.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 h-10 bg-muted border-border text-foreground placeholder:text-muted-foreground focus:border-[var(--color-accent)] focus:ring-[var(--color-accent)]/20"
                    required
                  />
                </div>
              </div>

              {/* Password field */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-foreground text-sm font-medium">
                    Password
                  </Label>
                  <Link 
                    href="/forgot-password"
                    className="text-sm text-[var(--color-accent)] hover:opacity-80 transition-opacity"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10 h-10 bg-muted border-border text-foreground placeholder:text-muted-foreground focus:border-[var(--color-accent)] focus:ring-[var(--color-accent)]/20"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Remember me */}
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="remember" 
                  className="border-border"
                />
                <Label 
                  htmlFor="remember" 
                  className="text-sm text-muted-foreground cursor-pointer font-normal"
                >
                  Keep me signed in
                </Label>
              </div>

              {/* Error message */}
              {error && (
                <p className="text-sm text-red-500 text-center">{error}</p>
              )}

              {/* Submit button */}
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-10 bg-[var(--color-accent)] text-foreground hover:bg-[var(--color-accent)]/90 font-medium rounded-md transition-all duration-200"
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
                    <span>Signing in...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span>Sign in</span>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                )}
              </Button>
            </form>

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-3 bg-card text-muted-foreground">
                  Secure admin access
                </span>
              </div>
            </div>

            {/* Footer */}
            <p className="text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link 
                href="/signup"
                className="text-[var(--color-accent)] hover:opacity-80 transition-opacity font-medium"
              >
                Sign up
              </Link>
            </p>
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
