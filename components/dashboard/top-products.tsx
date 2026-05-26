import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { MoreHorizontal } from "lucide-react"

const products = [
  {
    name: "Hydrating Vitamin C Serum",
    category: "Skincare",
    price: "R199.99",
    image: "/hygiene-hub-serum.jpg",
  },
  {
    name: "Gentle Foaming Cleanser",
    category: "Skincare",
    price: "R129.99",
    image: "/facial-skinclenser.jpg",
  },
  {
    name: "Retinol Night Cream",
    category: "Skincare",
    price: "R299.99",
    image: "/skin-lightner.jpg",
  },
  {
    name: "Shea Butter Body Lotion",
    category: "Body Care",
    price: "R159.99",
    image: "/skincare-toner.jpg",
  },
]

export function TopProducts() {
  return (
    <Card className="bg-card border-border h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-medium">Top Products</CardTitle>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {products.map((product, index) => (
          <div key={index} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-muted overflow-hidden">
                <img
                  src={product.image || "/placeholder.svg"}
                  alt={product.name}
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
        ))}
      </CardContent>
    </Card>
  )
}
