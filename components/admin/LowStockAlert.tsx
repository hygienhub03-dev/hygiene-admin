"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui";

interface Product {
  _id: string;
  name?: string;
  stock?: number;
}

export default function LowStockAlert() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLowStock() {
      try {
        const res = await apiFetch<{ data?: Product[] }>("/api/admin/products/low-stock");
        setProducts(res.success ? res.data ?? [] : []);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    void fetchLowStock();
  }, []);

  if (loading || products.length === 0) return null;

  return (
    <Card className="border-destructive/50 bg-destructive/5">
      <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        <CardTitle className="text-sm font-medium text-destructive">
          Low Stock Alert
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="text-xs text-muted-foreground space-y-1">
          {products.map((p) => (
            <li key={p._id} className="flex justify-between">
              <span>{p.name ?? "Unknown"}</span>
              <span className="font-mono text-destructive">{p.stock}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
