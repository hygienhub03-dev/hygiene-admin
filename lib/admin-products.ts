import { apiFetch } from "@/lib/api";

export interface ProductDoc {
  id: string;
  image: string;
  title: string;
  description: string;
  category: string;
  brand: string;
  price: number;
  salePrice: number;
  totalStock: number;
  averageReview: number;
  unitsSold: number;
  revenue: number;
  isCombo: boolean;
  comboItems?: { product_id: string; quantity: number; name?: string }[];
  createdAt?: string;
  updatedAt?: string;
}

function mapProduct(doc: Record<string, any>): ProductDoc {
  // Extract image from product_images join (POST/PUT), images alias (GET), image_urls column, or image field
  let image = doc.image ?? "";
  if (!image && Array.isArray(doc.product_images) && doc.product_images.length > 0) {
    image = doc.product_images[0]?.url ?? "";
  }
  if (!image && Array.isArray(doc.images) && doc.images.length > 0) {
    image = doc.images[0]?.url ?? "";
  }
  if (!image && Array.isArray(doc.image_urls) && doc.image_urls.length > 0) {
    image = doc.image_urls[0] ?? "";
  }

  // Extract category name from nested object or string
  const category = typeof doc.category === "object"
    ? (doc.category?.name ?? "")
    : (doc.category ?? "");

  return {
    id: doc.id ?? doc.$id ?? "",
    image,
    title: doc.title ?? doc.name ?? "",
    description: doc.description ?? "",
    category,
    brand: doc.brand ?? "",
    price: Number(doc.price) ?? 0,
    salePrice: Number(doc.salePrice ?? doc.sale_price) ?? 0,
    totalStock: doc.totalStock ?? doc.stock ?? 0,
    averageReview: doc.averageReview ?? doc.average_review ?? 0,
    unitsSold: doc.unitsSold ?? 0,
    revenue: doc.revenue ?? 0,
    isCombo: doc.isCombo ?? doc.is_combo ?? false,
    comboItems: doc.comboItems ?? doc.combo_items ?? [],
    createdAt: doc.createdAt ?? doc.created_at,
    updatedAt: doc.updatedAt ?? doc.updated_at,
  };
}

async function uploadImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/products/upload", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message ?? "Image upload failed");
  }

  const data = await res.json();
  return data.url;
}

export async function listProducts(): Promise<ProductDoc[]> {
  const res = await apiFetch<{ data: any[] }>("/api/products");
  if (!res.success) throw new Error((res as any).message ?? "Failed to fetch products");
  return ((res as any).data ?? []).map(mapProduct);
}

export async function addProduct(
  data: {
    title: string;
    description: string;
    category: string;
    brand: string;
    price: number;
    salePrice: number;
    totalStock: number;
    image: string;
    isCombo?: boolean;
    comboItems?: { product_id: string; quantity: number }[];
  },
  imageFile: File | null,
): Promise<ProductDoc> {
  const image = imageFile ? await uploadImage(imageFile) : data.image;
  const res = await apiFetch<{ data: any }>("/api/products", {
    method: "POST",
    body: { ...data, image },
  });
  if (!res.success) throw new Error((res as any).message ?? "Failed to add product");
  return mapProduct((res as any).data);
}

export async function editProduct(
  id: string,
  data: {
    title: string;
    description: string;
    category: string;
    brand: string;
    price: number;
    salePrice: number;
    totalStock: number;
    image: string;
    isCombo?: boolean;
    comboItems?: { product_id: string; quantity: number }[];
  },
  imageFile: File | null,
): Promise<ProductDoc> {
  const image = imageFile ? await uploadImage(imageFile) : data.image;
  const res = await apiFetch<{ data: any }>(`/api/products/${id}`, {
    method: "PUT",
    body: { ...data, image },
  });
  if (!res.success) throw new Error((res as any).message ?? "Failed to update product");
  return mapProduct((res as any).data);
}

export async function deleteProduct(id: string): Promise<void> {
  const res = await apiFetch(`/api/products/${id}`, { method: "DELETE" });
  if (!res.success) throw new Error((res as any).message ?? "Failed to delete product");
}
