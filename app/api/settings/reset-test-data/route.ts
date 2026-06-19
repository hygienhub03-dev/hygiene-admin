import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdminForApi } from "@/lib/admin-auth";

const RESET_CONFIRMATION = "CLEAR TEST DATA";

const TABLES_TO_CLEAR = [
  "review_helpful_votes",
  "order_status_events",
  "order_items",
  "gift_card_transactions",
  "inventory_movements",
  "cart_items",
  "wishlists",
  "abandoned_carts",
  "subscriptions",
  "stock_subscriptions",
  "reviews",
  "orders",
  "email_events",
  "coupons",
  "promotions",
  "email_campaigns",
  "newsletter_subscribers",
  "currency_exchange_rates",
  "tax_rates",
];

export async function POST(req: NextRequest) {
  const authError = await requireAdminForApi(req);
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({}));
    if (body.confirm !== RESET_CONFIRMATION) {
      return NextResponse.json(
        { success: false, message: "Reset confirmation is required" },
        { status: 400 },
      );
    }

    const supabase = createSupabaseAdminClient();

    const counts: Record<string, number> = {};
    for (const table of TABLES_TO_CLEAR) {
      const { count, error } = await supabase
        .from(table)
        .select("*", { count: "exact", head: true });

      if (error) throw new Error(`Failed to count ${table}: ${error.message}`);
      counts[table] = count ?? 0;
    }

    const { data: nonAdminProfiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id")
      .neq("role", "admin");

    if (profilesError) {
      throw new Error(`Failed to load test users: ${profilesError.message}`);
    }

    const nonAdminUserIds = (nonAdminProfiles ?? [])
      .map((profile: any) => profile.id)
      .filter(Boolean);

    for (const table of TABLES_TO_CLEAR) {
      const { error } = await supabase.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");

      if (error) throw new Error(`Failed to clear ${table}: ${error.message}`);
    }

    if (nonAdminUserIds.length > 0) {
      const { error: profilesDeleteError } = await supabase
        .from("profiles")
        .delete()
        .in("id", nonAdminUserIds);

      if (profilesDeleteError) {
        throw new Error(`Failed to clear test user profiles: ${profilesDeleteError.message}`);
      }
    }

    const deletedAuthUsers: string[] = [];
    for (const userId of nonAdminUserIds) {
      try {
        const { error } = await supabase.auth.admin.deleteUser(userId);
        if (error) throw error;
        deletedAuthUsers.push(userId);
      } catch (error: any) {
        if (error?.status !== 404) {
          throw new Error(`Failed to delete test user ${userId}: ${error?.message ?? "Unknown error"}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: "Test data cleared successfully. Products and admin users were preserved.",
      deleted: {
        tables: counts,
        profiles: nonAdminUserIds.length,
        authUsers: deletedAuthUsers.length,
      },
    });
  } catch (error: any) {
    console.error("[DELETE /api/settings/reset-test-data]", error);
    return NextResponse.json(
      { success: false, message: error?.message ?? "Failed to clear test data" },
      { status: 500 },
    );
  }
}
