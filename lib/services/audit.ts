import type { SupabaseClient } from '@supabase/supabase-js'

export type AuditActorType = 'user' | 'system' | 'webhook' | 'job'

export interface AuditLogParams {
  actorId: string | null
  actorType?: AuditActorType
  action: string
  entityType: string
  entityId?: string | null
  oldValue?: Record<string, unknown> | null
  newValue?: Record<string, unknown> | null
  reason?: string | null
  metadata?: Record<string, unknown> | null
}

/**
 * Write an entry to the append-only audit_log table.
 * Uses the log_audit_event() RPC for consistency with DB-level audit trails.
 */
export async function logAuditEvent(
  admin: SupabaseClient,
  params: AuditLogParams,
): Promise<string | null> {
  try {
    const { data, error } = await admin.rpc('log_audit_event', {
      p_actor_id: params.actorId,
      p_actor_type: params.actorType ?? 'system',
      p_action: params.action,
      p_entity_type: params.entityType,
      p_entity_id: params.entityId ?? null,
      p_old_value: params.oldValue ?? null,
      p_new_value: params.newValue ?? null,
      p_reason: params.reason ?? null,
      p_metadata: params.metadata ?? null,
    })

    if (error) {
      console.error('Audit log error:', error.message)
      return null
    }

    return data as string | null
  } catch (e) {
    console.error('Audit log exception:', e)
    return null
  }
}

/**
 * Convenience wrappers for common audit events.
 */
export async function auditCommissionApproved(
  admin: SupabaseClient,
  adminId: string,
  commissionId: string,
  amountZar: number,
) {
  return logAuditEvent(admin, {
    actorId: adminId,
    actorType: 'user',
    action: 'commission.approve',
    entityType: 'commission',
    entityId: commissionId,
    newValue: { status: 'available', amount_zar: amountZar },
  })
}

export async function auditPayoutProcessed(
  admin: SupabaseClient,
  adminId: string,
  payoutId: string,
  action: string,
  amountZar: number,
) {
  return logAuditEvent(admin, {
    actorId: adminId,
    actorType: 'user',
    action: `payout.${action}`,
    entityType: 'payout',
    entityId: payoutId,
    newValue: { status: action, amount_zar: amountZar },
  })
}

export async function auditRankChanged(
  admin: SupabaseClient,
  distributorId: string,
  previousRank: string,
  newRank: string,
  changedBy?: string | null,
) {
  return logAuditEvent(admin, {
    actorId: changedBy ?? null,
    actorType: changedBy ? 'user' : 'system',
    action: 'distributor.rank_change',
    entityType: 'distributor',
    entityId: distributorId,
    oldValue: { rank: previousRank },
    newValue: { rank: newRank },
  })
}
