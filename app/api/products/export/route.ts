import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = createSupabaseAdminClient()

  const { data: products, error } = await supabase
    .from('products')
    .select('name, slug, description, price, stock, categories(name), material, color, is_active, featured')
    .order('name')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Build CSV
  const headers = ['name', 'slug', 'description', 'price', 'stock', 'category', 'material', 'color', 'is_active', 'featured']
  const rows = (products || []).map((p: any) => [
    p.name,
    p.slug,
    (p.description || '').replace(/"/g, '""'),
    p.price,
    p.stock || 0,
    p.categories?.name || '',
    p.material || '',
    p.color || '',
    p.is_active ?? true,
    p.featured ?? false,
  ])

  const csv = [
    headers.join(','),
    ...rows.map((r) => r.map((v) => `"${v}"`).join(',')),
  ].join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="products-${new Date().toISOString().split('T')[0]}.csv"`,
    },
  })
}
