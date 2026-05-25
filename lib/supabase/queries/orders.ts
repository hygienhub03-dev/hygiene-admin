import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function getAllOrders() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from('orders')
    .select(`
      id,
      user_id,
      total_amount,
      created_at
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;
  
  // Transform data to match the expected format
  return data?.map(order => ({
    userId: order.user_id,
    totalAmount: order.total_amount,
    orderDate: order.created_at
  })) || [];
}