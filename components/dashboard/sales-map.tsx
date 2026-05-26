"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ChevronDown } from "lucide-react"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"

interface ProvinceData {
  province: string
  value: number
  color: string
}

interface SalesMapProps {
  provinceData: ProvinceData[]
  topProvince: string
  topProvinceRevenue: string
  totalRevenue: string
}

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: ProvinceData }> }) => {
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

export function SalesMap({ provinceData, topProvince, topProvinceRevenue, totalRevenue }: SalesMapProps) {
  return (
    <Card className="bg-card border-border h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-base font-medium">Sales by Province</CardTitle>
          <p className="text-xs text-muted-foreground">Revenue distribution across South Africa</p>
        </div>
      </CardHeader>
      <CardContent>
        {provinceData.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            No province data available yet
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-6">
            {/* Stats panel */}
            <div className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground">Top Performing Province</p>
                <p className="text-2xl font-semibold">{topProvinceRevenue}</p>
                <p className="text-xs text-muted-foreground">{topProvince}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Revenue</p>
                <p className="text-2xl font-semibold">{totalRevenue}</p>
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
        )}
      </CardContent>
    </Card>
  )
}
