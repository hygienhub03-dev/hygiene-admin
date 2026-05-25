"use client";

import { useEffect, useMemo, useState } from "react";
import {
  listProducts,
  addProduct,
  editProduct,
  deleteProduct,
} from "@/lib/admin-products";
import { apiFetch } from "@/lib/api";
import {
  Card, CardHeader, CardTitle, CardContent,
  Badge, Button, Input, Select,
  Dialog, DialogHeader, DialogTitle, DialogBody, DialogFooter,
  Table, TableHead, TableBody, TableRow, TableHeadCell, TableCell,
  Pagination, Tooltip,
  PlusIcon, SearchIcon, EditIcon, TrashIcon, FilterIcon,
  TagIcon, PackageIcon, DotsVerticalIcon, ChevronDownIcon,
} from "./ui";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  status: "active" | "draft" | "archived";
  unitsSold: number;
  revenue: number;
  image: string;
}

const PAGE_SIZE = 9;

const STATUS_MAP = {
  active:   { label: "Active",   variant: "success"  } as const,
  draft:    { label: "Draft",    variant: "warning"  } as const,
  archived: { label: "Archived", variant: "muted"    } as const,
};

function money(n: number) {
  return `R${n.toFixed(2)}`;
}

function stockBadge(stock: number) {
  if (stock === 0)  return <Badge variant="destructive">Out of Stock</Badge>;
  if (stock < 30)   return <Badge variant="warning">Low — {stock}</Badge>;
  return <span className="text-sm text-foreground font-medium">{stock}</span>;
}

// ─── Product Form Dialog ───────────────────────────────────────────────────────
interface ProductFormProps {
  product: Partial<Product> | null;
  categories: string[];
  open: boolean;
  onClose: () => void;
  onSave: (p: Product, imageFile: File | null) => Promise<{ ok: boolean; error?: string }>;
}

function ProductFormDialog({ product, categories, open, onClose, onSave }: ProductFormProps) {
  const isNew = !product?.id;
  const [form, setForm] = useState<Partial<Product>>(
    product ?? { status: "active", stock: 0, unitsSold: 0, revenue: 0 }
  );
  const [imageFile, setImageFile]         = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [saving, setSaving]               = useState(false);
  const [submitError, setSubmitError]     = useState<string | null>(null);
  const [touched, setTouched]             = useState<Record<string, boolean>>({});
  const [customCategory, setCustomCategory] = useState("");

  useEffect(() => {
    if (!imageFile) { setImagePreviewUrl(null); return; }
    const url = URL.createObjectURL(imageFile);
    setImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  function set<K extends keyof Product>(key: K, val: Product[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  const normalizedCategory = useMemo(() => {
    const raw = form.category ?? "";
    if (raw === "__new__") return customCategory.trim();
    return raw.trim();
  }, [form.category, customCategory]);

  const nameValid  = !!(form.name ?? "").trim();
  const skuValid   = !!(form.sku ?? "").trim();
  const priceValid = typeof form.price === "number" && Number.isFinite(form.price) && form.price >= 0;
  const canSubmit  = nameValid && skuValid && priceValid && !saving;

  async function handleSubmit() {
    setSubmitError(null);
    setTouched({ name: true, sku: true, price: true, category: true });
    if (!nameValid || !skuValid || !priceValid) { setSubmitError("Please fill in all required fields."); return; }

    const payload: Product = {
      id: form.id ?? "__new__",
      sku: (form.sku ?? "").trim(),
      name: (form.name ?? "").trim(),
      category: normalizedCategory || "Uncategorized",
      price: form.price!,
      stock: typeof form.stock === "number" && Number.isFinite(form.stock) && form.stock >= 0 ? form.stock : 0,
      status: form.status ?? "active",
      unitsSold: form.unitsSold ?? 0,
      revenue: form.revenue ?? 0,
      image: form.image ?? "📦",
    };

    setSaving(true);
    const result = await onSave(payload, imageFile);
    setSaving(false);
    if (!result.ok) { setSubmitError(result.error ?? "Could not save product."); return; }
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader onClose={onClose}>
        <DialogTitle>{isNew ? "Add New Product" : "Edit Product"}</DialogTitle>
        <p className="text-xs text-muted-foreground mt-0.5">
          {isNew ? "Fill in the details for the new product." : `Editing ${product?.name}`}
        </p>
      </DialogHeader>
      <DialogBody className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Input label="Product Name *" id="name" value={form.name ?? ""} onChange={(e) => { setTouched((t) => ({ ...t, name: true })); set("name", e.target.value); }} placeholder="e.g. Running Shoes Pro" />
          {touched.name && !nameValid && <p className="mt-1 text-xs text-destructive">Product name is required.</p>}
        </div>
        <Input label="SKU *" id="sku" value={form.sku ?? ""} onChange={(e) => { setTouched((t) => ({ ...t, sku: true })); set("sku", e.target.value); }} placeholder="SKU-001" />
        {touched.sku && !skuValid && <div className="-mt-3 col-span-1"><p className="text-xs text-destructive">SKU is required.</p></div>}
        <Select
          label="Category" id="category" value={form.category ?? ""}
          onChange={(e) => { setTouched((t) => ({ ...t, category: true })); const v = e.target.value; set("category", v); if (v !== "__new__") setCustomCategory(""); }}
          options={[{ value: "", label: "Select category…" }, ...categories.map((c) => ({ value: c, label: c })), { value: "__new__", label: "+ New category" }]}
        />
        {form.category === "__new__" && <Input label="New Category" id="custom-category" value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} placeholder="e.g. Footwear" />}
        <Input
          label="Price (ZAR) *" id="price" type="number" min="0" step="0.01" value={form.price ?? ""}
          onChange={(e) => { setTouched((t) => ({ ...t, price: true })); const raw = e.target.value; if (raw === "") { setForm((f) => ({ ...f, price: undefined })); return; } const num = Number(raw); setForm((f) => ({ ...f, price: Number.isFinite(num) ? num : undefined })); }}
          placeholder="0.00"
        />
        {touched.price && !priceValid && <div className="-mt-3 col-span-1"><p className="text-xs text-destructive">A valid price is required.</p></div>}
        <Input
          label="Stock Quantity" id="stock" type="number" min="0" value={form.stock ?? ""}
          onChange={(e) => { const raw = e.target.value; if (raw === "") { setForm((f) => ({ ...f, stock: undefined })); return; } const num = Number(raw); setForm((f) => ({ ...f, stock: Number.isFinite(num) ? Math.max(0, Math.floor(num)) : undefined })); }}
          placeholder="0"
        />
        <Select label="Status" id="status" value={form.status ?? "active"} onChange={(e) => set("status", e.target.value as Product["status"])} options={[{ value: "active", label: "Active" }, { value: "draft", label: "Draft" }, { value: "archived", label: "Archived" }]} />
        <div className="col-span-2 grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-foreground mb-1">Product Image</label>
            <input type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; setImageFile(file); set("image", file.name); }} className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2 file:text-xs file:font-medium file:text-foreground hover:file:bg-accent disabled:opacity-60" />
          </div>
          <Input label="Image URL" id="image" value={form.image ?? ""} onChange={(e) => { set("image", e.target.value); setImageFile(null); }} placeholder="https://..." />
          <div className="flex items-end">
            {imagePreviewUrl ? (
              <img src={imagePreviewUrl} alt="Product preview" className="h-16 w-16 rounded-md border border-border object-cover" />
            ) : typeof form.image === "string" && /^(https?:\/\/|data:)/i.test(form.image) ? (
              <img src={form.image} alt="Product preview" className="h-16 w-16 rounded-md border border-border object-cover" />
            ) : (
              <div className="h-16 w-16 rounded-md border border-border bg-muted flex items-center justify-center text-lg">{form.image || "📦"}</div>
            )}
          </div>
        </div>
        {submitError && (
          <div className="col-span-2">
            <div className="rounded-lg border border-destructive/25 bg-destructive/8 px-4 py-3">
              <p className="text-xs text-destructive font-medium">{submitError}</p>
            </div>
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit}>
          {isNew ? "Add Product" : "Save Changes"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

// ─── Delete Confirm Dialog ────────────────────────────────────────────────────
function DeleteDialog({ product, open, onClose, onConfirm }: { product: Product | null; open: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader onClose={onClose}>
        <DialogTitle>Delete Product</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Are you sure you want to delete{" "}
          <span className="font-semibold text-foreground">{product?.name}</span>?
          This action cannot be undone.
        </p>
        {(product?.unitsSold ?? 0) > 0 && (
          <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/8 px-4 py-3">
            <p className="text-xs text-destructive font-medium">
              This product has {product?.unitsSold} units sold on record.
            </p>
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="destructive" onClick={() => { onConfirm(); onClose(); }}>
          <TrashIcon className="h-3.5 w-3.5" />
          Delete Product
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

// ─── Row Actions Menu ─────────────────────────────────────────────────────────
function RowActions({ product, onEdit, onDelete }: { product: Product; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" aria-label={`Actions for ${product.name}`}>
        <DotsVerticalIcon className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 top-full z-20 mt-1 w-40 animate-in-up rounded-lg border border-border bg-popover shadow-xl py-1">
            <button className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-accent transition-colors" onClick={() => { onEdit(); setOpen(false); }}>
              <EditIcon className="h-3.5 w-3.5 text-muted-foreground" /> Edit
            </button>
            <button className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors" onClick={() => { onDelete(); setOpen(false); }}>
              <TrashIcon className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── ProductsView ─────────────────────────────────────────────────────────────
export default function ProductsView() {
  const [products, setProducts]       = useState<Product[]>([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [search, setSearch]           = useState("");
  const [catFilter, setCatFilter]     = useState("");
  const [statusFilter, setStatus]     = useState("");
  const [page, setPage]               = useState(1);
  const [editTarget, setEditTarget]   = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [formOpen, setFormOpen]       = useState(false);
  const [deleteOpen, setDeleteOpen]   = useState(false);

  const CATEGORIES = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean))].sort(), [products]);

  async function loadProducts() {
    setLoading(true);
    setError(null);
    try {
      // 1. Load base product data
      const docs = await listProducts();

      // 2. Kick off sales recompute in parallel (non-blocking — best effort)
      //    Returns { stats: { [productId]: { unitsSold, revenue } } }
      const salesPromise = apiFetch<{ success: boolean; stats?: Record<string, { unitsSold: number; revenue: number }> }>(
        "/api/admin/products/recompute-sales",
        { method: "POST" }
      ).catch(() => null);

      // 3. Build base list while sales recompute runs
      const baseList = docs.map((p) => ({
        id: p.id,
        sku: `SKU-${p.id.slice(-6).toUpperCase()}`,
        name: p.title || "Untitled",
        category: p.category || "Uncategorized",
        price: p.price ?? 0,
        stock: p.totalStock ?? 0,
        status: "active" as const,
        unitsSold: 0,
        revenue: 0,
        image: p.image || "📦",
      }));

      // 4. Merge sales data — stats is a { [productId]: { unitsSold, revenue } } map
      const salesRes = await salesPromise;
      if (salesRes?.success && salesRes.stats) {
        for (const p of baseList) {
          const s = salesRes.stats[p.id];
          if (s) {
            p.unitsSold = typeof s.unitsSold === "number" ? s.unitsSold : 0;
            p.revenue   = typeof s.revenue   === "number" ? s.revenue   : 0;
          }
        }
      }

      setProducts(baseList);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load products");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadProducts(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter((p) => {
      const matchSearch = !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
      const matchCat    = !catFilter || p.category === catFilter;
      const matchStatus = !statusFilter || p.status === statusFilter;
      return matchSearch && matchCat && matchStatus;
    });
  }, [products, search, catFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paged      = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  async function handleSave(p: Product, imageFile: File | null): Promise<{ ok: boolean; error?: string }> {
    setError(null);
    try {
      if (p.id && p.id !== "__new__") {
        await editProduct(p.id, { title: p.name, description: "", category: p.category, brand: "", price: p.price, salePrice: 0, totalStock: p.stock, image: p.image }, imageFile);
      } else {
        await addProduct({ title: p.name, description: "", category: p.category, brand: "", price: p.price, salePrice: 0, totalStock: p.stock, image: p.image }, imageFile);
      }
      await loadProducts();
      return { ok: true };
    } catch (err: any) {
      const msg = err?.message ?? "Failed to save product";
      setError(msg);
      return { ok: false, error: msg };
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setError(null);
    try {
      await deleteProduct(deleteTarget.id);
      await loadProducts();
    } catch (err: any) {
      setError(err?.message ?? "Failed to delete product");
    }
  }

  const totalRevenue  = products.reduce((a, p) => a + (p.revenue || 0), 0);
  const totalUnitsSold = products.reduce((a, p) => a + (p.unitsSold || 0), 0);
  const outOfStock    = products.filter((p) => p.stock === 0).length;
  const activeCount   = products.filter((p) => p.status === "active").length;

  return (
    <div className="flex flex-col gap-6 animate-in-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Products</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {products.length} total products across {CATEGORIES.length} categories
          </p>
        </div>
        <Button size="md" onClick={() => { setEditTarget(null); setFormOpen(true); }}>
          <PlusIcon className="h-4 w-4" />
          Add Product
        </Button>
      </div>

      {error && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total Products", value: products.length,          icon: PackageIcon,  accent: "text-chart-1" },
          { label: "Units Sold",     value: totalUnitsSold,            icon: TagIcon,      accent: "text-success"  },
          { label: "Out of Stock",   value: outOfStock,                icon: TrashIcon,    accent: "text-destructive" },
          { label: "Total Revenue",  value: money(totalRevenue),       icon: BarChartIcon, accent: "text-chart-3" },
        ].map(({ label, value, icon: Icon, accent }) => (
          <Card key={label} className="card-shine">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`${accent} flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted`}>
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <div className="text-lg font-bold text-foreground">{value}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {products.length === 0 && !loading && !error && (
        <Card>
          <CardContent className="p-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <PackageIcon className="h-6 w-6" />
            </div>
            <p className="mt-3 text-sm font-semibold text-foreground">No products yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Add your first product to start managing inventory.</p>
            <div className="mt-4 flex justify-center">
              <Button onClick={() => { setEditTarget(null); setFormOpen(true); }}>
                <PlusIcon className="h-4 w-4" /> Add Product
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search by name or SKU…" className="h-9 w-full rounded-md border border-border bg-input pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors" />
          </div>
          <div className="flex gap-2 flex-wrap">
            <select value={catFilter} onChange={(e) => { setCatFilter(e.target.value); setPage(1); }} className="h-9 rounded-md border border-border bg-input px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors cursor-pointer">
              <option value="">All Categories</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="h-9 rounded-md border border-border bg-input px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors cursor-pointer">
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>
            {(search || catFilter || statusFilter) && (
              <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setCatFilter(""); setStatus(""); setPage(1); }}>Clear filters</Button>
            )}
          </div>
          <div className="ml-auto text-xs text-muted-foreground hidden sm:block">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeadCell>Product</TableHeadCell>
              <TableHeadCell className="hidden sm:table-cell">SKU</TableHeadCell>
              <TableHeadCell className="hidden md:table-cell">Category</TableHeadCell>
              <TableHeadCell>Price</TableHeadCell>
              <TableHeadCell>Stock</TableHeadCell>
              <TableHeadCell>Status</TableHeadCell>
              <TableHeadCell className="hidden lg:table-cell">Units Sold</TableHeadCell>
              <TableHeadCell className="hidden xl:table-cell text-right">Revenue</TableHeadCell>
              <TableHeadCell className="text-right">Actions</TableHeadCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell className="py-16 text-center text-muted-foreground col-span-9">
                  <div className="flex flex-col items-center gap-2">
                    <PackageIcon className="h-8 w-8 text-muted-foreground/40" />
                    <span className="text-sm">Loading products…</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : paged.length === 0 ? (
              <TableRow>
                <TableCell className="py-16 text-center text-muted-foreground col-span-9">
                  <div className="flex flex-col items-center gap-2">
                    <PackageIcon className="h-8 w-8 text-muted-foreground/40" />
                    <span className="text-sm">{products.length === 0 ? "No products yet" : "No products match your filters"}</span>
                    {(search || catFilter || statusFilter) && (
                      <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setCatFilter(""); setStatus(""); }}>Clear filters</Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paged.map((product) => {
                const s = STATUS_MAP[product.status];
                return (
                  <TableRow key={product.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-lg overflow-hidden">
                          {typeof product.image === "string" && /^(https?:\/\/|data:)/i.test(product.image) ? (
                            <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
                          ) : product.image}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-foreground truncate max-w-[160px]">{product.name}</div>
                          <div className="text-xs text-muted-foreground sm:hidden">{product.sku}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className="font-mono text-xs text-muted-foreground">{product.sku}</span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="outline">{product.category}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold text-foreground">R{product.price.toFixed(2)}</span>
                    </TableCell>
                    <TableCell>{stockBadge(product.stock)}</TableCell>
                    <TableCell>
                      <Badge variant={s.variant}>{s.label}</Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-foreground">{product.unitsSold.toLocaleString()}</span>
                        {product.unitsSold > 0 && (
                          <div className="h-1 w-20 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-primary/60" style={{ width: `${Math.min((product.unitsSold / Math.max(...paged.map((p) => p.unitsSold), 1)) * 100, 100)}%` }} />
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden xl:table-cell text-right">
                      <span className="text-sm font-semibold text-foreground">{money(product.revenue)}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActions product={product} onEdit={() => { setEditTarget(product); setFormOpen(true); }} onDelete={() => { setDeleteTarget(product); setDeleteOpen(true); }} />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Showing <span className="font-medium text-foreground">{(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)}</span> of <span className="font-medium text-foreground">{filtered.length}</span> products
            </p>
            <Pagination page={safePage} totalPages={totalPages} onPageChange={(p) => setPage(p)} />
          </div>
        )}
      </Card>

      <ProductFormDialog product={editTarget} categories={CATEGORIES} open={formOpen} onClose={() => setFormOpen(false)} onSave={handleSave} />
      <DeleteDialog product={deleteTarget} open={deleteOpen} onClose={() => setDeleteOpen(false)} onConfirm={handleDelete} />
    </div>
  );
}

// ─── Local icon ───────────────────────────────────────────────────────────────
function BarChartIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/>
    </svg>
  );
}
