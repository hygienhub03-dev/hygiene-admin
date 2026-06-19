"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import { Upload, Loader2, Plus, Trash2, Package } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { addProduct, editProduct, listProducts, type ProductDoc } from "@/lib/admin-products"

const CATEGORIES = ["Skincare", "Body Care", "Hair Care", "Fragrances", "Accessories"]

interface ProductModalProps {
  open: boolean
  product: ProductDoc | null
  onClose: () => void
  onSaved: (product: ProductDoc) => void
}

interface ComboItemRow {
  product_id: string
  quantity: number
  name: string
}

interface FormState {
  title: string
  description: string
  category: string
  brand: string
  price: string
  salePrice: string
  totalStock: string
  image: string
  isCombo: boolean
}

const empty: FormState = {
  title: "",
  description: "",
  category: "",
  brand: "",
  price: "",
  salePrice: "",
  totalStock: "0",
  image: "",
  isCombo: false,
}

function toForm(p: ProductDoc): FormState {
  return {
    title: p.title,
    description: p.description,
    category: p.category,
    brand: p.brand,
    price: String(p.price),
    salePrice: String(p.salePrice),
    totalStock: String(p.totalStock),
    image: p.image,
    isCombo: p.isCombo ?? false,
  }
}

export function ProductModal({ open, product, onClose, onSaved }: ProductModalProps) {
  const [form, setForm] = useState<FormState>(empty)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string>("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Combo state
  const [comboItems, setComboItems] = useState<ComboItemRow[]>([])
  const [allProducts, setAllProducts] = useState<ProductDoc[]>([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [selectedProductId, setSelectedProductId] = useState<string>("")
  const [selectedQty, setSelectedQty] = useState("1")

  useEffect(() => {
    if (open) {
      setForm(product ? toForm(product) : empty)
      setImageFile(null)
      setImagePreview(product?.image ?? "")
      setError("")
      setSelectedProductId("")
      setSelectedQty("1")
      // Restore existing combo items when editing
      if (product?.isCombo && product.comboItems) {
        setComboItems(
          product.comboItems.map((ci) => ({
            product_id: ci.product_id,
            quantity: ci.quantity,
            name: ci.name ?? "",
          }))
        )
      } else {
        setComboItems([])
      }
    }
  }, [open, product])

  // Load all non-combo products for combo picker
  useEffect(() => {
    if (open && form.isCombo && allProducts.length === 0) {
      setProductsLoading(true)
      listProducts()
        .then((ps) => setAllProducts(ps.filter((p) => !p.isCombo)))
        .catch(console.error)
        .finally(() => setProductsLoading(false))
    }
  }, [open, form.isCombo])

  function set(field: keyof FormState, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  function handleAddComboItem() {
    if (!selectedProductId) return
    const qty = Math.max(1, parseInt(selectedQty) || 1)
    const product = allProducts.find((p) => p.id === selectedProductId)
    if (!product) return
    // Prevent duplicate
    if (comboItems.some((ci) => ci.product_id === selectedProductId)) return
    setComboItems((prev) => [...prev, { product_id: selectedProductId, quantity: qty, name: product.title }])
    setSelectedProductId("")
    setSelectedQty("1")
  }

  function handleRemoveComboItem(productId: string) {
    setComboItems((prev) => prev.filter((ci) => ci.product_id !== productId))
  }

  function updateComboQty(productId: string, qty: number) {
    setComboItems((prev) =>
      prev.map((ci) => ci.product_id === productId ? { ...ci, quantity: Math.max(1, qty) } : ci)
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    const price = parseFloat(form.price)
    const salePrice = parseFloat(form.salePrice || "0")
    const totalStock = form.isCombo ? 999 : parseInt(form.totalStock, 10)

    if (!form.title.trim()) return setError("Product name is required.")
    if (isNaN(price) || price < 0) return setError("Enter a valid price.")
    if (form.isCombo && comboItems.length < 2) return setError("A combo must include at least 2 products.")
    if (!form.isCombo && (isNaN(totalStock) || totalStock < 0)) return setError("Enter a valid stock quantity.")

    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        brand: form.brand.trim(),
        price,
        salePrice: isNaN(salePrice) ? 0 : salePrice,
        totalStock,
        image: form.image,
        isCombo: form.isCombo,
        comboItems: form.isCombo ? comboItems.map((ci) => ({ product_id: ci.product_id, quantity: ci.quantity })) : [],
      }

      const saved = product
        ? await editProduct(product.id, payload, imageFile)
        : await addProduct(payload, imageFile)

      onSaved(saved)
      onClose()
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const isEdit = product !== null
  const availableToAdd = allProducts.filter(
    (p) => p.id !== product?.id && !comboItems.some((ci) => ci.product_id === p.id)
  )

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto bg-card border-border">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Product" : "Add Product"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update the product details below." : "Fill in the details to add a new product."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Combo Toggle */}
          <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/40">
            <Package className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Combo Product</p>
              <p className="text-xs text-muted-foreground">Bundle multiple products into one listing with a combined price</p>
            </div>
            <button
              type="button"
              onClick={() => set("isCombo", !form.isCombo)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                form.isCombo ? "bg-foreground" : "bg-muted border border-border"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                  form.isCombo ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Image upload */}
          <div className="space-y-2">
            <Label>Product Image</Label>
            <div
              className="relative w-full h-40 rounded-lg border-2 border-dashed border-border bg-muted flex items-center justify-center cursor-pointer hover:border-foreground/40 transition-colors overflow-hidden"
              onClick={() => fileInputRef.current?.click()}
            >
              {imagePreview ? (
                <>
                  <Image
                    src={imagePreview}
                    alt="Preview"
                    fill
                    className="object-cover rounded-lg"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-white text-sm font-medium">Change image</span>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Upload className="w-6 h-6" />
                  <span className="text-sm">Click to upload image</span>
                  <span className="text-xs">JPEG, PNG, WebP — max 5MB</span>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="title">
              {form.isCombo ? "Combo Name" : "Product Name"} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              name="title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder={form.isCombo ? "e.g. Perfect Duo — Soap + Cream" : "e.g. Vitamin C Serum"}
              className="bg-background"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              name="description"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Short product description..."
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </div>

          {/* Category + Brand */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select value={form.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger id="category" className="bg-background">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand">Brand</Label>
              <Input
                id="brand"
                name="brand"
                value={form.brand}
                onChange={(e) => set("brand", e.target.value)}
                placeholder="e.g. Hygiene Hub"
                className="bg-background"
              />
            </div>
          </div>

          {/* Combo Items Section */}
          {form.isCombo && (
            <div className="space-y-3">
              <Label>Combo Products <span className="text-destructive">*</span></Label>
              <p className="text-xs text-muted-foreground">Add at least 2 products that make up this combo</p>

              {/* Existing combo items */}
              {comboItems.length > 0 && (
                <div className="space-y-2 rounded-lg border border-border p-3">
                  {comboItems.map((ci) => (
                    <div key={ci.product_id} className="flex items-center gap-2">
                      <span className="flex-1 text-sm truncate">{ci.name}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">Qty:</span>
                        <input
                          type="number"
                          min="1"
                          max="99"
                          value={ci.quantity}
                          onChange={(e) => updateComboQty(ci.product_id, parseInt(e.target.value) || 1)}
                          className="w-14 text-center text-xs border border-border rounded px-1 py-0.5 bg-background"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveComboItem(ci.product_id)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add product to combo */}
              {productsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading products...
                </div>
              ) : (
                <div className="flex gap-2">
                  <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                    <SelectTrigger className="bg-background flex-1 text-sm">
                      <SelectValue placeholder="Select a product to add" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableToAdd.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.title} — R{p.price}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <input
                    type="number"
                    min="1"
                    max="99"
                    value={selectedQty}
                    onChange={(e) => setSelectedQty(e.target.value)}
                    placeholder="Qty"
                    className="w-16 text-center text-sm border border-border rounded-md px-2 py-1.5 bg-background"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddComboItem}
                    disabled={!selectedProductId}
                    className="gap-1 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Price + Sale Price */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price">
                {form.isCombo ? "Combo Price (R)" : "Price (R)"} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="price"
                name="price"
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(e) => set("price", e.target.value)}
                placeholder="0.00"
                className="bg-background"
              />
              {form.isCombo && comboItems.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Individual total: R{allProducts
                    .filter((p) => comboItems.some((ci) => ci.product_id === p.id))
                    .reduce((sum, p) => {
                      const qty = comboItems.find((ci) => ci.product_id === p.id)?.quantity ?? 1
                      return sum + (p.salePrice || p.price) * qty
                    }, 0)
                    .toFixed(2)}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="salePrice">Sale Price (R)</Label>
              <Input
                id="salePrice"
                name="salePrice"
                type="number"
                min="0"
                step="0.01"
                value={form.salePrice}
                onChange={(e) => set("salePrice", e.target.value)}
                placeholder="0.00"
                className="bg-background"
              />
            </div>
          </div>

          {/* Stock — hide for combos (stock is managed by components) */}
          {!form.isCombo && (
            <div className="space-y-2">
              <Label htmlFor="totalStock">
                Stock Quantity <span className="text-destructive">*</span>
              </Label>
              <Input
                id="totalStock"
                name="totalStock"
                type="number"
                min="0"
                step="1"
                value={form.totalStock}
                onChange={(e) => set("totalStock", e.target.value)}
                placeholder="0"
                className="bg-background"
              />
            </div>
          )}
          {form.isCombo && (
            <p className="text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-md">
              Stock for combo products is determined by the component products' availability.
            </p>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
              {error}
            </p>
          )}
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="submit"
            onClick={handleSubmit}
            disabled={saving}
            className="bg-[var(--color-positive)] hover:bg-[var(--color-positive)]/90 text-white min-w-[100px]"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving...</>
            ) : (
              isEdit ? "Save Changes" : form.isCombo ? "Create Combo" : "Add Product"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
