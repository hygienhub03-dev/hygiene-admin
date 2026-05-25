import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
  return lines.slice(1).map((line) => {
    const values = line.match(/(".*?"|[^,]+)/g) || []
    const row: Record<string, string> = {}
    headers.forEach((h, i) => {
      row[h] = (values[i] || '').trim().replace(/^"|"$/g, '')
    })
    return row
  })
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const text = await file.text()
    const rows = parseCSV(text)

    if (rows.length === 0) {
      return NextResponse.json({ error: 'CSV is empty or invalid' }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    let imported = 0
    const errors: string[] = []

    for (const row of rows) {
      if (!row.name || !row.slug || !row.price) {
        errors.push(`Skipped row: missing required fields (name/slug/price)`)
        continue
      }

      // Resolve category
      let categoryId: string | null = null
      if (row.category) {
        const { data: cat } = await supabase
          .from('categories')
          .select('id')
          .eq('name', row.category)
          .single()
        if (cat) categoryId = cat.id
      }

      const product: Record<string, any> = {
        name: row.name,
        slug: row.slug,
        description: row.description || null,
        price: parseFloat(row.price) || 0,
        stock: parseInt(row.stock) || 0,
        material: row.material || null,
        color: row.color || null,
        is_active: row.is_active !== 'false',
        featured: row.featured === 'true',
      }
      if (categoryId) product.category_id = categoryId

      const { error } = await supabase
        .from('products')
        .upsert(product, { onConflict: 'slug' })

      if (error) {
        errors.push(`Failed to import "${row.name}": ${error.message}`)
      } else {
        imported++
      }
    }

    return NextResponse.json({ imported, errors: errors.length > 0 ? errors : undefined })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
