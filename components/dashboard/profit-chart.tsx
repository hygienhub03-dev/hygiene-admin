"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts"

interface ChartDataPoint {
  month: string
  sales: number
  revenue: number
}

interface ProfitChartProps {
  data: ChartDataPoint[]
  totalProfit: string
  growth: string
  growthPositive: boolean
}

export function ProfitChart({ data, totalProfit, growth, growthPositive }: ProfitChartProps) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-base font-medium">Total Profit Overview</CardTitle>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-3xl font-semibold">{totalProfit}</span>
            {growth && (
              <span className="text-xs bg-[var(--color-accent)]/30 text-foreground px-2 py-0.5 rounded-full flex items-center gap-1">
                {growth}
                <span className="text-[10px]">{growthPositive ? "↗" : "↘"}</span>
              </span>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-6 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[var(--color-chart-gray)]" />
            <span className="text-xs text-muted-foreground">Total Sales</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[var(--color-chart-orange)]" />
            <span className="text-xs text-muted-foreground">Total Revenue</span>
          </div>
        </div>
        {data.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
            No sales data available yet
          </div>
        ) : (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#737373" }} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "#737373" }}
                  tickFormatter={(value) => `${value / 1000}k`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1a1a1a",
                    border: "none",
                    borderRadius: "8px",
                    color: "#fff",
                    fontSize: "12px",
                  }}
                  formatter={(value: number, name: string) => [
                    `R${value.toLocaleString()}`,
                    name === "sales" ? "Sales" : "Revenue",
                  ]}
                  labelFormatter={(label) => `${label} 2026`}
                />
                <Bar dataKey="sales" radius={[4, 4, 0, 0]} maxBarSize={20}>
                  {data.map((entry, index) => (
                    <Cell key={`sales-${index}`} fill="#d4d4d4" />
                  ))}
                </Bar>
                <Bar dataKey="revenue" radius={[4, 4, 0, 0]} maxBarSize={20}>
                  {data.map((entry, index) => (
                    <Cell key={`revenue-${index}`} fill="#fdba74" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
