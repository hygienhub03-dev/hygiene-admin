import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export async function getAllProducts() {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('products')
    .select(`
      id,
      name,
      slug,
      price,
      stock,
      categories(name),
      image_urls
    `)
    .order('name');

  if (error) throw error;

  return data?.map(product => ({
    _id: product.id,
    name: product.name,
    slug: product.slug,
    price: product.price,
    stock: product.stock,
    category: (product.categories as any)?.name || '',
    image: product.image_urls?.[0] || ''
  })) || [];
}

export async function getProductById(id: string) {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('products')
    .select(`
      id,
      name,
      slug,
      description,
      price,
      sale_price,
      stock,
      brand,
      categories(name),
      image_urls,
      featured,
      status,
      average_review,
      created_at
    `)
    .eq('id', id)
    .single();

  if (error) throw error;

  return {
    _id: data?.id,
    name: data?.name,
    slug: data?.slug,
    description: data?.description,
    price: data?.price,
    salePrice: data?.sale_price,
    stock: data?.stock,
    brand: data?.brand,
    category: (data?.categories as any)?.name || '',
    images: data?.image_urls || [],
    featured: data?.featured,
    status: data?.status,
    averageReview: data?.average_review,
    createdAt: data?.created_at
  };
}

export async function updateProductStock(id: string, stock: number) {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('products')
    .update({ stock })
    .eq('id', id);

  if (error) throw error;
  return { success: true };
}
