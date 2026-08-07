"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { MoreHorizontal } from "lucide-react"
import Image from "next/image"

interface Product {
  name: string
  category: string
  price: string
  image: string
}

interface TopProductsProps {
  products: Product[]
}

export function TopProducts({ products }: TopProductsProps) {
  return (
    <Card className="bg-card border-border h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-medium">Top Products</CardTitle>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {products.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            No product data available yet
          </div>
        ) : (
          products.map((product, index) => (
            <div key={index} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-muted overflow-hidden">
                  <Image
                    src={product.image || "/placeholder.svg"}
                    alt={product.name}
                    width={48}
                    height={48}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <p className="text-sm font-medium">{product.name}</p>
                  <p className="text-xs text-muted-foreground">{product.category}</p>
                </div>
              </div>
              <span className="text-sm font-medium">{product.price}</span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
