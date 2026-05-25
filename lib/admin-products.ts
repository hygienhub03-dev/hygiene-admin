// Admin product operations through local Next.js API routes (Supabase-backed).

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
  createdAt?: string;
  updatedAt?: string;
}

function mapProduct(doc: Record<string, any>): ProductDoc {
  return {
    id: doc.id ?? doc.$id ?? "",
    image: doc.image ?? "",
    title: doc.title ?? doc.name ?? "",
    description: doc.description ?? "",
    category: doc.category ?? "",
    brand: doc.brand ?? "",
    price: doc.price ?? 0,
    salePrice: doc.salePrice ?? 0,
    totalStock: doc.totalStock ?? doc.stock ?? 0,
    averageReview: doc.averageReview ?? 0,
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
