"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import { Upload, Loader2 } from "lucide-react"
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
import { addProduct, editProduct, type ProductDoc } from "@/lib/admin-products"

const CATEGORIES = ["Skincare", "Body Care", "Hair Care", "Fragrances", "Accessories"]

interface ProductModalProps {
  open: boolean
  product: ProductDoc | null
  onClose: () => void
  onSaved: (product: ProductDoc) => void
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
}

const empty: FormState = {
  title: "",
  description: "",
  category: "",
  brand: "",
  price: "",
  salePrice: "",
  totalStock: "",
  image: "",
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
  }
}

export function ProductModal({ open, product, onClose, onSaved }: ProductModalProps) {
  const [form, setForm] = useState<FormState>(empty)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string>("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setForm(product ? toForm(product) : empty)
      setImageFile(null)
      setImagePreview(product?.image ?? "")
      setError("")
    }
  }, [open, product])

  function set(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    const price = parseFloat(form.price)
    const salePrice = parseFloat(form.salePrice || "0")
    const totalStock = parseInt(form.totalStock, 10)

    if (!form.title.trim()) return setError("Product name is required.")
    if (isNaN(price) || price < 0) return setError("Enter a valid price.")
    if (isNaN(totalStock) || totalStock < 0) return setError("Enter a valid stock quantity.")

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
              Product Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              name="title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Vitamin C Serum"
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

          {/* Price + Sale Price */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price">
                Price (R) <span className="text-destructive">*</span>
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

          {/* Stock */}
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
              isEdit ? "Save Changes" : "Add Product"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
