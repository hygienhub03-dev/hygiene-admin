"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { BarChart3, PieChart } from "lucide-react"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
} from "recharts"

interface ChartDataPoint {
  month: string
  thisYear: number
  lastYear: number
}

interface CategoryItem {
  name: string
  value: number
  color: string
}

interface ReportsChartsProps {
  chartData: ChartDataPoint[]
  categoryData: CategoryItem[]
}

export function ReportsCharts({ chartData, categoryData }: ReportsChartsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
      {/* Revenue Chart */}
      <Card className="lg:col-span-2 bg-card border border-border">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Revenue Trend
              </CardTitle>
              <CardDescription>Monthly sales performance</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">
              No revenue data available yet
            </div>
          ) : (
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#9CA3AF" />
                  <YAxis tick={{ fontSize: 12 }} stroke="#9CA3AF" tickFormatter={(v) => `R${v/1000}k`} />
                  <Tooltip
                    formatter={(value: number) => [`R${value.toLocaleString()}`, ""]}
                    contentStyle={{
                      backgroundColor: "white",
                      border: "1px solid #E5E5E5",
                      borderRadius: "8px",
                      fontSize: "12px"
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="thisYear"
                    stroke="#B4D4A5"
                    fill="#B4D4A5"
                    fillOpacity={0.3}
                    strokeWidth={2}
                    name="Revenue"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sales by Category */}
      <Card className="bg-card border border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <PieChart className="w-4 h-4" />
            Sales by Category
          </CardTitle>
          <CardDescription>Distribution of revenue</CardDescription>
        </CardHeader>
        <CardContent>
          {categoryData.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
              No category data yet
            </div>
          ) : (
            <>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {categoryData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [`${value}%`, ""]}
                      contentStyle={{
                        backgroundColor: "white",
                        border: "1px solid #E5E5E5",
                        borderRadius: "8px",
                        fontSize: "12px"
                      }}
                    />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {categoryData.map((cat) => (
                  <div key={cat.name} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                    <span className="text-xs text-muted-foreground">{cat.name}</span>
                    <span className="text-xs font-medium ml-auto">{cat.value}%</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
