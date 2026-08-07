'use client'

import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '@/components/dashboard/page-header'
import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/api'

type Commission = {
  id: string
  earner_id: string
  source_order_id: string | null
  level: number
  type: string
  amount_zar: number
  status: string
  created_at: string
  note: string | null
}

type Payout = {
  id: string
  distributor_id: string
  amount_zar: number
  method: string
  status: string
  created_at: string
  note: string | null
}

type Distributor = {
  id: string
  referral_code: string
  rank: string
  status: string
  enrolled_at: string
  sponsor_id: string | null
  wallets?: { balance_zar: number; lifetime_earned_zar: number } | null
}

function zar(n: number | string) {
  return `R${Number(n).toFixed(2)}`
}

export default function NetworkPage() {
  const [tab, setTab] = useState<'commissions' | 'payouts' | 'distributors'>('commissions')
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [distributors, setDistributors] = useState<Distributor[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setMessage(null)
    try {
      if (tab === 'commissions') {
        const res = await apiFetch<{ data: Commission[] }>('/api/network/commissions?status=pending')
        if (!res.success) throw new Error(res.message || 'Failed')
        setCommissions(res.data ?? [])
        setSelected(new Set())
      } else if (tab === 'payouts') {
        const res = await apiFetch<{ data: Payout[] }>('/api/network/payouts')
        if (!res.success) throw new Error(res.message || 'Failed')
        setPayouts(res.data ?? [])
      } else {
        const res = await apiFetch<{ data: Distributor[] }>('/api/network/distributors')
        if (!res.success) throw new Error(res.message || 'Failed')
        setDistributors(res.data ?? [])
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => {
    load()
  }, [load])

  async function approveSelected() {
    if (selected.size === 0) return
    setLoading(true)
    try {
      const res = await apiFetch<{ approved: number }>('/api/network/commissions', {
        method: 'POST',
        body: { ids: Array.from(selected) },
      })
      if (!res.success) throw new Error(res.message || 'Failed')
      setMessage(`Approved ${res.approved} commission(s) — wallets credited`)
      await load()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Approve failed')
    } finally {
      setLoading(false)
    }
  }

  async function handlePayout(id: string, action: 'paid' | 'rejected') {
    setLoading(true)
    try {
      const res = await apiFetch('/api/network/payouts', {
        method: 'POST',
        body: { id, action },
      })
      if (!res.success) throw new Error(res.message || 'Failed')
      setMessage(`Payout ${action}`)
      await load()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Payout action failed')
    } finally {
      setLoading(false)
    }
  }

  async function updateDistributor(
    id: string,
    patch: { rank?: string; status?: string },
  ) {
    setLoading(true)
    try {
      const res = await apiFetch('/api/network/distributors', {
        method: 'PATCH',
        body: { id, ...patch },
      })
      if (!res.success) throw new Error(res.message || 'Failed')
      setMessage('Distributor updated')
      await load()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setLoading(false)
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Network"
        description="Approve commissions, process payouts, and manage distributor ranks"
      />

      <div className="flex flex-wrap gap-2">
        {(['commissions', 'payouts', 'distributors'] as const).map((t) => (
          <Button
            key={t}
            variant={tab === t ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </Button>
        ))}
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          Refresh
        </Button>
      </div>

      {message && (
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{message}</p>
      )}

      {tab === 'commissions' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={approveSelected}
              disabled={loading || selected.size === 0}
            >
              Approve selected ({selected.size})
            </Button>
            <p className="text-sm text-muted-foreground">
              Approving credits partner wallets. Pending only.
            </p>
          </div>
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3 w-10" />
                  <th className="p-3">Date</th>
                  <th className="p-3">Earner</th>
                  <th className="p-3">Order</th>
                  <th className="p-3">Level</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Note</th>
                </tr>
              </thead>
              <tbody>
                {commissions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground">
                      No pending commissions
                    </td>
                  </tr>
                ) : (
                  commissions.map((c) => (
                    <tr key={c.id} className="border-t">
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={selected.has(c.id)}
                          onChange={() => toggle(c.id)}
                        />
                      </td>
                      <td className="p-3">
                        {new Date(c.created_at).toLocaleString('en-ZA')}
                      </td>
                      <td className="p-3 font-mono text-xs">
                        {c.earner_id.slice(0, 8)}…
                      </td>
                      <td className="p-3 font-mono text-xs">
                        {c.source_order_id
                          ? c.source_order_id.slice(0, 8).toUpperCase()
                          : '—'}
                      </td>
                      <td className="p-3">L{c.level}</td>
                      <td className="p-3 font-medium">{zar(c.amount_zar)}</td>
                      <td className="p-3 text-muted-foreground">{c.note}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'payouts' && (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Distributor</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Method</th>
                <th className="p-3">Status</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {payouts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    No payouts
                  </td>
                </tr>
              ) : (
                payouts.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="p-3">
                      {new Date(p.created_at).toLocaleString('en-ZA')}
                    </td>
                    <td className="p-3 font-mono text-xs">
                      {p.distributor_id.slice(0, 8)}…
                    </td>
                    <td className="p-3 font-medium">{zar(p.amount_zar)}</td>
                    <td className="p-3 uppercase">{p.method}</td>
                    <td className="p-3 capitalize">{p.status}</td>
                    <td className="p-3 space-x-2">
                      {['requested', 'processing'].includes(p.status) && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handlePayout(p.id, 'paid')}
                            disabled={loading}
                          >
                            Mark paid
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handlePayout(p.id, 'rejected')}
                            disabled={loading}
                          >
                            Reject
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'distributors' && (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Code</th>
                <th className="p-3">Rank</th>
                <th className="p-3">Status</th>
                <th className="p-3">Balance</th>
                <th className="p-3">Lifetime</th>
                <th className="p-3">Joined</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {distributors.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">
                    No distributors (run MLM schema + enrol partners)
                  </td>
                </tr>
              ) : (
                distributors.map((d) => (
                  <tr key={d.id} className="border-t">
                    <td className="p-3 font-mono text-xs">{d.referral_code}</td>
                    <td className="p-3">
                      <select
                        className="rounded border bg-background px-2 py-1 text-sm"
                        value={d.rank}
                        onChange={(e) =>
                          updateDistributor(d.id, { rank: e.target.value })
                        }
                      >
                        {['member', 'bronze', 'silver', 'gold', 'platinum'].map(
                          (r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ),
                        )}
                      </select>
                    </td>
                    <td className="p-3">
                      <select
                        className="rounded border bg-background px-2 py-1 text-sm"
                        value={d.status}
                        onChange={(e) =>
                          updateDistributor(d.id, { status: e.target.value })
                        }
                      >
                        {['pending', 'active', 'suspended'].map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3">
                      {zar(d.wallets?.balance_zar ?? 0)}
                    </td>
                    <td className="p-3">
                      {zar(d.wallets?.lifetime_earned_zar ?? 0)}
                    </td>
                    <td className="p-3">
                      {new Date(d.enrolled_at).toLocaleDateString('en-ZA')}
                    </td>
                    <td className="p-3 font-mono text-xs text-muted-foreground">
                      {d.id.slice(0, 8)}…
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
