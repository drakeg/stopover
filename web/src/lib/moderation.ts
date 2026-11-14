import { supabase } from './supabase'

export type AccountStatus = { is_admin: boolean; suspended: boolean; suspended_reason: string | null }

export type AdminReport = {
  id: string
  kind: 'review' | 'message' | 'check-in' | 'person'
  status: 'open' | 'dismissed' | 'actioned'
  reason: string | null
  created_at: string
  reporter: string
  reported_id: string
  reported_name: string
  reported_email: string | null
  reported_suspended: boolean
  reports_against: number
  content: string | null
  review_id: string | null
  review_hidden: boolean | null
  resolution: string | null
  resolved_at: string | null
}

export type Suspended = { user_id: string; name: string; email: string | null; reason: string | null; created_at: string }

export type ResolveAction = 'dismiss' | 'hide-review' | 'suspend'

const rpc = async <T,>(fn: string, args?: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

export async function accountStatus(): Promise<AccountStatus> {
  const rows = await rpc<AccountStatus[]>('my_account_status')
  return rows[0] ?? { is_admin: false, suspended: false, suspended_reason: null }
}

export const reportReview = (reviewId: string, reason: string) => rpc<void>('report_review', { p_review: reviewId, p_reason: reason })

export const adminReports = (status: 'open' | 'resolved' | 'all' = 'open') => rpc<AdminReport[]>('admin_reports', { p_status: status })
export const resolveReport = (id: string, action: ResolveAction, note?: string) =>
  rpc<void>('admin_resolve_report', { p_report: id, p_action: action, p_note: note?.trim() || null })
export const adminSuspended = () => rpc<Suspended[]>('admin_suspended')
export const unsuspend = (userId: string) => rpc<void>('admin_unsuspend', { p_user: userId })
export const setReviewHidden = (reviewId: string, hidden: boolean) => rpc<void>('admin_set_review_hidden', { p_review: reviewId, p_hidden: hidden })
