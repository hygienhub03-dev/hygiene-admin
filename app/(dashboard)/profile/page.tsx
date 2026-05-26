"use client"

import { useState, useRef, useEffect } from "react"
import { PageHeader } from "@/components/dashboard/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Camera, Mail, Phone, Calendar, Shield, Key, Loader2, AlertCircle } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"

interface ActivityEvent {
  action: string
  time: string
  icon: typeof Shield
}

function timeAgo(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`
  if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`
  return date.toLocaleDateString("en-ZA", { month: "short", day: "numeric", year: "numeric" })
}

export default function ProfilePage() {
  const { user, profile, updateProfile } = useAuth()
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [activityLog, setActivityLog] = useState<ActivityEvent[]>([])
  const [passwordChangeMessage, setPasswordChangeMessage] = useState("")
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [passwordForm, setPasswordForm] = useState({ current: "", newPass: "", confirm: "" })
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    phone: "",
  })
  const [initialized, setInitialized] = useState(false)

  // Initialize form data from profile once loaded
  if (!initialized && profile) {
    setFormData({
      firstName: profile.first_name || "",
      lastName: profile.last_name || "",
      phone: profile.phone || "",
    })
    setInitialized(true)
  }

  // Load real activity from order_status_events and product changes
  useEffect(() => {
    if (!user) return
    const supabase = createSupabaseBrowserClient()

    async function loadActivity() {
      const activities: ActivityEvent[] = []

      // Recent order status changes (admin activity)
      const { data: statusEvents } = await supabase
        .from("order_status_events")
        .select("status, note, created_at")
        .order("created_at", { ascending: false })
        .limit(5)

      if (statusEvents) {
        for (const event of statusEvents as any[]) {
          const statusMap: Record<string, string> = {
            processing: "Updated order to processing",
            confirmed: "Confirmed an order",
            shipped: "Shipped an order",
            delivered: "Marked order as delivered",
            cancelled: "Cancelled an order",
          }
          activities.push({
            action: statusMap[event.status] || event.note || `Order status: ${event.status}`,
            time: timeAgo(event.created_at),
            icon: Shield,
          })
        }
      }

      // Recent product additions
      const { data: recentProducts } = await supabase
        .from("products")
        .select("name, created_at")
        .order("created_at", { ascending: false })
        .limit(3)

      if (recentProducts) {
        for (const product of recentProducts as any[]) {
          activities.push({
            action: `Added product: ${product.name}`,
            time: timeAgo(product.created_at),
            icon: Key,
          })
        }
      }

      // Sort by most recent first and limit
      activities.sort((a, b) => {
        // timeAgo strings don't sort well, but this is good enough for display
        return 0
      })

      if (activities.length === 0) {
        activities.push({
          action: "No recent activity yet",
          time: "",
          icon: Shield,
        })
      }

      setActivityLog(activities.slice(0, 8))
    }

    loadActivity()
  }, [user])

  const [avatarKey, setAvatarKey] = useState(0)

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    setIsUploadingAvatar(true)
    setSaveMessage("")
    try {
      const supabase = createSupabaseBrowserClient()

      // Upload to Supabase Storage
      const ext = file.name.split(".").pop() || "jpg"
      const path = `${user.id}-${Date.now()}.${ext}`

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { contentType: file.type, upsert: true })

      if (uploadError) {
        console.error("Avatar upload error:", uploadError)
        setSaveMessage(`Upload failed: ${uploadError.message}`)
        setTimeout(() => setSaveMessage(""), 5000)
        return
      }

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(uploadData.path)
      const avatarUrl = urlData.publicUrl

      // Update profile with new avatar URL
      const { error: updateError } = await updateProfile({ avatar_url: avatarUrl })
      if (updateError) {
        console.error("Profile update error:", updateError)
        setSaveMessage(`Upload succeeded but profile update failed: ${updateError.message || updateError}`)
        setTimeout(() => setSaveMessage(""), 5000)
        return
      }

      // Force avatar image to re-render with cache bust
      setAvatarKey(prev => prev + 1)
      setSaveMessage("Avatar updated!")
      setTimeout(() => setSaveMessage(""), 3000)
    } catch (err: any) {
      console.error("Avatar upload exception:", err)
      setSaveMessage(`Error: ${err?.message || "Unknown error"}`)
      setTimeout(() => setSaveMessage(""), 5000)
    } finally {
      setIsUploadingAvatar(false)
      // Reset file input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    setSaveMessage("")

    const { error } = await updateProfile({
      first_name: formData.firstName,
      last_name: formData.lastName,
      phone: formData.phone,
    })

    if (error) {
      setSaveMessage("Failed to save changes")
    } else {
      setSaveMessage("Changes saved!")
    }
    setIsSaving(false)
    setTimeout(() => setSaveMessage(""), 3000)
  }

  const handlePasswordChange = async () => {
    setPasswordChangeMessage("")
    if (!passwordForm.newPass || passwordForm.newPass.length < 6) {
      setPasswordChangeMessage("Password must be at least 6 characters")
      return
    }
    if (passwordForm.newPass !== passwordForm.confirm) {
      setPasswordChangeMessage("Passwords don't match")
      return
    }

    setIsChangingPassword(true)
    const supabase = createSupabaseBrowserClient()
    const { error } = await supabase.auth.updateUser({ password: passwordForm.newPass })

    if (error) {
      setPasswordChangeMessage(error.message)
    } else {
      setPasswordChangeMessage("Password changed!")
      setShowPasswordForm(false)
      setPasswordForm({ current: "", newPass: "", confirm: "" })
    }
    setIsChangingPassword(false)
    setTimeout(() => setPasswordChangeMessage(""), 5000)
  }

  // Compute password age from user metadata
  const passwordAge = user?.last_sign_in_at
    ? `Last login: ${timeAgo(user.last_sign_in_at)}`
    : "No recent login data"

  const displayName = profile
    ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || user?.email || "Admin"
    : user?.email || "Admin"
  const initials = profile
    ? `${profile.first_name?.[0] || ""}${profile.last_name?.[0] || ""}`.toUpperCase() || user?.email?.[0]?.toUpperCase() || "A"
    : "A"

  return (
    <>
      <PageHeader
        title="Profile"
        description="Manage your account settings and preferences."
      >
        <div className="flex items-center gap-2">
          {saveMessage && (
            <span className={`text-sm ${saveMessage.includes("Failed") || saveMessage.includes("Failed") ? "text-red-500" : "text-[var(--color-positive)]"}`}>
              {saveMessage}
            </span>
          )}
          <Button
            className="bg-foreground text-background hover:bg-foreground/90"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Card */}
        <Card className="bg-card border border-border">
          <CardContent className="p-6">
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-4">
                <Avatar className="h-24 w-24" key={avatarKey}>
                  <AvatarImage src={profile?.avatar_url ? `${profile.avatar_url}?t=${avatarKey}` : "/professional-man-avatar.png"} />
                  <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
                </Avatar>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingAvatar}
                  className="absolute bottom-0 right-0 p-2 bg-foreground text-background rounded-full hover:bg-foreground/90 transition-colors disabled:opacity-50"
                >
                  {isUploadingAvatar ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Camera className="w-4 h-4" />
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleAvatarUpload}
                />
              </div>
              <h2 className="text-xl font-semibold">{displayName}</h2>
              <p className="text-sm text-muted-foreground">{user?.email || "No email"}</p>
              <Badge className="mt-2 bg-[var(--color-accent)] text-foreground hover:bg-[var(--color-accent)]/90">
                {profile?.role || "Admin"}
              </Badge>

              <Separator className="my-6" />

              <div className="w-full space-y-4 text-left">
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">{user?.email || "No email"}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">{profile?.phone || "Not set"}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">
                    Joined {user?.created_at ? new Date(user.created_at).toLocaleDateString("en-ZA", { month: "long", year: "numeric" }) : "Unknown"}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Account Settings */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-card border border-border">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-medium">Personal Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={formData.firstName}
                    onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={formData.lastName}
                    onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input id="email" type="email" value={user?.email || ""} disabled />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border border-border">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-medium">Security</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-background rounded-lg">
                    <Key className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Password</p>
                    <p className="text-xs text-muted-foreground">{passwordAge}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-transparent"
                  onClick={() => setShowPasswordForm(!showPasswordForm)}
                >
                  {showPasswordForm ? "Cancel" : "Change"}
                </Button>
              </div>

              {showPasswordForm && (
                <div className="p-4 border border-border rounded-lg space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">New Password</Label>
                    <Input
                      id="newPassword"
                      type="password"
                      value={passwordForm.newPass}
                      onChange={(e) => setPasswordForm(prev => ({ ...prev, newPass: e.target.value }))}
                      placeholder="At least 6 characters"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={passwordForm.confirm}
                      onChange={(e) => setPasswordForm(prev => ({ ...prev, confirm: e.target.value }))}
                      placeholder="Re-enter new password"
                    />
                  </div>
                  {passwordChangeMessage && (
                    <p className={`text-sm ${passwordChangeMessage.includes("changed") ? "text-[var(--color-positive)]" : "text-red-500"}`}>
                      {passwordChangeMessage}
                    </p>
                  )}
                  <Button
                    size="sm"
                    onClick={handlePasswordChange}
                    disabled={isChangingPassword}
                  >
                    {isChangingPassword ? "Changing..." : "Update Password"}
                  </Button>
                </div>
              )}

            </CardContent>
          </Card>

          <Card className="bg-card border border-border">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-medium">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {activityLog.map((activity, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className="p-2 bg-muted rounded-lg">
                      <activity.icon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm">{activity.action}</p>
                      {activity.time && <p className="text-xs text-muted-foreground">{activity.time}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
