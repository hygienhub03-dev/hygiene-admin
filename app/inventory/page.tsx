"use client";

import { type ChangeEvent, useEffect, useState } from "react";
import { getAllProducts } from "@/lib/supabase/queries/products";
import {
  Card, CardContent, CardHeader, CardTitle,
  Button, Input, Badge,
  Table, TableHead, TableBody, TableRow, TableHeadCell, TableCell,
  SearchIcon, FilterIcon,
} from "@/components/admin/ui";

interface Product {
  _id: string;
  name?: string;
  price?: number;
  stock?: number;
  category?: string;
  image?: string;
}

function money(n: number) {
  return `R${n.toFixed(2)}`;
}

function stockBadge(stock: number) {
  if (stock === 0) return <Badge variant="destructive">Out of Stock</Badge>;
  if (stock < 30) return <Badge variant="warning">Low — {stock}</Badge>;
  return <span className="text-sm text-foreground font-medium">{stock}</span>;
}

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [categories, setCategories] = useState<string[]>([]);

   useEffect(() => {
     async function load() {
       try {
         const data = await getAllProducts();
         setProducts(data || []);
         // Extract unique categories
         const cats = [...new Set(data?.map((p: Product) => p.category).filter(Boolean))];
         setCategories(cats as string[]);
       } catch (e) {
         console.error("Failed to load products", e);
       } finally {
         setLoading(false);
       }
     }
     void load();
   }, []);

  const filtered = products.filter((p) => {
    const matchesSearch = !search || 
      (p.name?.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchesCategory = categoryFilter === "all" || p.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="flex flex-col gap-6 animate-in-up">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Inventory Management</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage product stock levels and availability.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            value={search}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 rounded-md border border-input bg-background text-sm"
        >
          <option value="all">All Categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      {/* Products Table */}
      <Card>
        <CardHeader>
          <CardTitle>Products ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-center text-muted-foreground">Loading products...</div>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeadCell>Product</TableHeadCell>
                  <TableHeadCell>Category</TableHeadCell>
                  <TableHeadCell>Price</TableHeadCell>
                  <TableHeadCell>Stock</TableHeadCell>
                  <TableHeadCell>Status</TableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((product) => (
                  <TableRow key={product._id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {product.image && (
                          <img 
                            src={product.image} 
                            alt={product.name} 
                            className="h-8 w-8 rounded object-cover" 
                          />
                        )}
                        <span className="font-medium text-sm">{product.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {product.category ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {product.price ? money(product.price) : "—"}
                    </TableCell>
                    <TableCell>
                      {stockBadge(product.stock ?? 0)}
                    </TableCell>
                    <TableCell>
                      {product.stock === 0 ? (
                        <Badge variant="destructive">Out</Badge>
                      ) : product.stock! < 30 ? (
                        <Badge variant="warning">Low</Badge>
                      ) : (
                        <Badge variant="success">In Stock</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      No products found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
