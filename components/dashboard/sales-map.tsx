"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ChevronDown } from "lucide-react"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"

const provinceData = [
  { province: "Gauteng", value: 45680, color: "#3b82f6" },
  { province: "Western Cape", value: 28320, color: "#22c55e" },
  { province: "KwaZulu-Natal", value: 15450, color: "#8b5cf6" },
  { province: "Eastern Cape", value: 8970, color: "#f97316" },
]

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: typeof provinceData[0] }> }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    return (
      <div className="bg-card px-3 py-2 rounded-lg shadow-lg text-xs font-medium border border-border">
        <p className="font-semibold">{data.province}</p>
        <p style={{ color: data.color }}>R{data.value.toLocaleString()}</p>
      </div>
    )
  }
  return null
}

export function SalesMap() {
  const total = provinceData.reduce((sum, item) => sum + item.value, 0)

  return (
    <Card className="bg-card border-border h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-base font-medium">Sales by Province</CardTitle>
          <p className="text-xs text-muted-foreground">Revenue distribution across South Africa</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-7 text-xs bg-transparent">
            All Products <ChevronDown className="w-3 h-3 ml-1" />
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs bg-transparent">
            Top Provinces <ChevronDown className="w-3 h-3 ml-1" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-6">
          {/* Stats panel */}
          <div className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground">Top Performing Province</p>
              <p className="text-2xl font-semibold">R45,680</p>
              <p className="text-xs text-muted-foreground">Gauteng</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Revenue Growth</p>
              <p className="text-2xl font-semibold text-[var(--color-positive)]">+34%</p>
              <p className="text-xs text-muted-foreground">Gauteng & Western Cape</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Revenue</p>
              <p className="text-2xl font-semibold">R{total.toLocaleString()}</p>
            </div>
          </div>

          {/* Pie Chart */}
          <div className="flex flex-col">
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={provinceData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {provinceData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            {/* Legend */}
            <div className="grid grid-cols-2 gap-2 mt-2">
              {provinceData.map((item) => (
                <div key={item.province} className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-xs text-muted-foreground truncate">{item.province}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
