"use client"

import { useState, useMemo, useEffect } from "react"
import Image from "next/image"
import { PageHeader } from "@/components/dashboard/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Plus, Search, ChevronDown, Package, Tag, AlertTriangle, TrendingUp, MoreVertical } from "lucide-react"
import { listProducts, deleteProduct, type ProductDoc } from "@/lib/admin-products"
import { ProductModal } from "@/components/dashboard/product-modal"

interface ProductItem {
  id: string
  name: string
  image: string
  sku: string
  category: string
  price: number
  stock: number
  status: string
  unitsSold: number
  revenue: number
  raw: ProductDoc
}

const categories = ["All Categories", "Skincare", "Body Care", "Hair Care", "Fragrances", "Accessories"]
const statuses = ["All Statuses", "Active", "Inactive", "Out of Stock"]

export default function ProductsPage() {
  const [productsData, setProductsData] = useState<ProductItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("All Categories")
  const [selectedStatus, setSelectedStatus] = useState("All Statuses")

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<ProductDoc | null>(null)

  useEffect(() => {
    loadProducts()
  }, [])

  const loadProducts = async () => {
    try {
      const products = await listProducts()
      setProductsData(products.map((p) => ({
        id: p.id,
        name: p.title,
        image: p.image || "/placeholder.svg",
        sku: `SKU-${p.id.slice(0, 8).toUpperCase()}`,
        category: p.category || "Uncategorized",
        price: p.price,
        stock: p.totalStock,
        status: p.totalStock === 0 ? "Out of Stock" : "Active",
        unitsSold: p.unitsSold || 0,
        revenue: p.revenue || 0,
        raw: p,
      })))
    } catch (err) {
      console.error("Failed to load products:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this product?")) return
    try {
      await deleteProduct(id)
      setProductsData(prev => prev.filter(p => p.id !== id))
    } catch (err) {
      console.error("Failed to delete product:", err)
    }
  }

  const handleAddProduct = () => {
    setEditingProduct(null)
    setModalOpen(true)
  }

  const handleEditProduct = (product: ProductItem) => {
    setEditingProduct(product.raw)
    setModalOpen(true)
  }

  const handleProductSaved = (saved: ProductDoc) => {
    // Reload products to get fresh data including sales
    loadProducts()
  }

  const filteredProducts = useMemo(() => {
    return productsData.filter((product) => {
      const matchesSearch =
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.sku.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesCategory =
        selectedCategory === "All Categories" || product.category === selectedCategory
      const matchesStatus =
        selectedStatus === "All Statuses" || product.status === selectedStatus
      return matchesSearch && matchesCategory && matchesStatus
    })
  }, [productsData, searchQuery, selectedCategory, selectedStatus])

  // Calculate metrics
  const totalProducts = productsData.length
  const totalUnitsSold = productsData.reduce((sum, p) => sum + p.unitsSold, 0)
  const outOfStock = productsData.filter((p) => p.stock === 0).length
  const totalRevenue = productsData.reduce((sum, p) => sum + p.revenue, 0)

  // Get unique categories count
  const uniqueCategories = new Set(productsData.map((p) => p.category)).size

  return (
    <>
      <PageHeader
        title="Products"
        description={`${totalProducts} total products across ${uniqueCategories} categories`}
      >
        <Button
          className="flex items-center gap-2 bg-[var(--color-positive)] hover:bg-[var(--color-positive)]/90 text-white"
          onClick={handleAddProduct}
        >
          <Plus className="w-4 h-4" />
          Add Product
        </Button>
      </PageHeader>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="bg-card border border-border">
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-2">
              <div className="p-2 bg-muted rounded-lg">
                <Package className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
            <p className="text-3xl font-semibold mb-1">{totalProducts}</p>
            <span className="text-sm text-muted-foreground">Total Products</span>
          </CardContent>
        </Card>

        <Card className="bg-card border border-border">
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-2">
              <div className="p-2 bg-muted rounded-lg">
                <Tag className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
            <p className="text-3xl font-semibold mb-1">{totalUnitsSold}</p>
            <span className="text-sm text-muted-foreground">Units Sold</span>
          </CardContent>
        </Card>

        <Card className="bg-card border border-border">
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-2">
              <div className="p-2 bg-muted rounded-lg">
                <AlertTriangle className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
            <p className="text-3xl font-semibold mb-1">{outOfStock}</p>
            <span className="text-sm text-muted-foreground">Out of Stock</span>
          </CardContent>
        </Card>

        <Card className="bg-card border border-border">
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-2">
              <div className="p-2 bg-muted rounded-lg">
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
            <p className="text-3xl font-semibold mb-1">R{totalRevenue.toFixed(2)}</p>
            <span className="text-sm text-muted-foreground">Total Revenue</span>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-card border-border"
          />
        </div>

        <div className="flex gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2 bg-card">
                {selectedCategory}
                <ChevronDown className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {categories.map((category) => (
                <DropdownMenuItem
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                >
                  {category}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2 bg-card">
                {selectedStatus}
                <ChevronDown className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {statuses.map((status) => (
                <DropdownMenuItem
                  key={status}
                  onClick={() => setSelectedStatus(status)}
                >
                  {status}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <span className="text-sm text-muted-foreground self-center ml-auto">
          {filteredProducts.length} results
        </span>
      </div>

      {/* Products Table */}
      <Card className="bg-card border border-border">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground" />
            </div>
          ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground font-medium">PRODUCT</TableHead>
                <TableHead className="text-muted-foreground font-medium">SKU</TableHead>
                <TableHead className="text-muted-foreground font-medium">CATEGORY</TableHead>
                <TableHead className="text-muted-foreground font-medium">PRICE</TableHead>
                <TableHead className="text-muted-foreground font-medium">STOCK</TableHead>
                <TableHead className="text-muted-foreground font-medium">STATUS</TableHead>
                <TableHead className="text-muted-foreground font-medium">UNITS SOLD</TableHead>
                <TableHead className="text-muted-foreground font-medium">REVENUE</TableHead>
                <TableHead className="text-muted-foreground font-medium">ACTIONS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map((product) => (
                <TableRow key={product.id} className="border-border">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                        <Image
                          src={product.image}
                          alt={product.name}
                          width={40}
                          height={40}
                          className="object-cover"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement
                            target.style.display = "none"
                          }}
                        />
                      </div>
                      <span className="font-medium max-w-[150px] truncate">{product.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{product.sku}</TableCell>
                  <TableCell>
                    <span className="px-3 py-1 rounded-full bg-muted text-sm text-foreground">
                      {product.category}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium">R{product.price.toFixed(2)}</TableCell>
                  <TableCell>{product.stock}</TableCell>
                  <TableCell>
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium ${
                        product.status === "Active"
                          ? "bg-[var(--color-positive)]/20 text-[var(--color-positive)]"
                          : product.status === "Inactive"
                          ? "bg-muted text-muted-foreground"
                          : "bg-[var(--color-negative)]/20 text-[var(--color-negative)]"
                      }`}
                    >
                      {product.status}
                    </span>
                  </TableCell>
                  <TableCell>{product.unitsSold}</TableCell>
                  <TableCell className="font-medium">R{product.revenue.toFixed(2)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEditProduct(product)}>
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem>View Details</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(product.id)}>
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          )}
        </CardContent>
      </Card>

      {/* Product Add/Edit Modal */}
      <ProductModal
        open={modalOpen}
        product={editingProduct}
        onClose={() => setModalOpen(false)}
        onSaved={handleProductSaved}
      />
    </>
  )
}
