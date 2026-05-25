'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Mail, Send, Users, Clock, CheckCircle } from 'lucide-react'

interface Campaign {
  id: string
  name: string
  subject: string
  status: 'draft' | 'sent' | 'scheduled'
  sent_count: number
  created_at: string
}

export default function EmailCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [sending, setSending] = useState(false)
  const [form, setForm] = useState({ name: '', subject: '', body: '' })

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/admin/email-campaigns')
      if (res.ok) {
        const data = await res.json()
        setCampaigns(data.campaigns || [])
      }
      setLoading(false)
    }
    load()
  }, [])

  const handleSend = async () => {
    if (!form.name || !form.subject || !form.body) return
    setSending(true)

    const res = await fetch('/api/admin/email-campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    if (res.ok) {
      const data = await res.json()
      setCampaigns([data.campaign, ...campaigns])
      setShowNew(false)
      setForm({ name: '', subject: '', body: '' })
    }
    setSending(false)
  }

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-800',
    sent: 'bg-green-100 text-green-800',
    scheduled: 'bg-blue-100 text-blue-800',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Email Campaigns</h1>
        <Button onClick={() => setShowNew(!showNew)}>
          <Mail className="h-4 w-4 mr-2" />
          New Campaign
        </Button>
      </div>

      {/* New Campaign Form */}
      {showNew && (
        <Card className="p-6">
          <h2 className="font-semibold mb-4">Create Campaign</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Campaign Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="Summer Sale Announcement"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email Subject</label>
              <input
                type="text"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="Don't miss our summer deals!"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email Body (HTML)</label>
              <textarea
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                rows={8}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent font-mono text-sm"
                placeholder="<h1>Summer Sale!</h1><p>Up to 50% off...</p>"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSend} disabled={sending}>
                <Send className="h-4 w-4 mr-2" />
                {sending ? 'Sending...' : 'Send to All Subscribers'}
              </Button>
              <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
            </div>
          </div>
        </Card>
      )}

      {/* Campaigns List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <Card className="p-12 text-center">
          <Mail className="h-12 w-12 mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500">No campaigns yet</p>
          <p className="text-sm text-gray-400 mt-1">Create your first email campaign</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign) => (
            <Card key={campaign.id} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">{campaign.name}</h3>
                  <p className="text-sm text-gray-500">{campaign.subject}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right text-sm">
                    <div className="flex items-center gap-1 text-gray-500">
                      <Users className="h-3 w-3" />
                      <span>{campaign.sent_count} sent</span>
                    </div>
                    <div className="flex items-center gap-1 text-gray-400 text-xs">
                      <Clock className="h-3 w-3" />
                      <span>{new Date(campaign.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <Badge className={statusColors[campaign.status]}>
                    {campaign.status === 'sent' && <CheckCircle className="h-3 w-3 mr-1" />}
                    {campaign.status}
                  </Badge>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
