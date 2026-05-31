export function downloadCSV(filename: string, rows: Record<string, string | number>[]) {
  if (rows.length === 0) return

  const headers = Object.keys(rows[0])
  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = String(row[h] ?? "")
          return val.includes(",") || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val
        })
        .join(",")
    ),
  ].join("\n")

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export type Period = "week" | "month" | "year" | "all"

export function getPeriodLabel(period: Period): string {
  const labels: Record<Period, string> = {
    week: "This Week",
    month: "This Month",
    year: "This Year",
    all: "All Time",
  }
  return labels[period]
}

export function getPeriodDates(period: Period): { start?: string; end?: string } {
  const now = new Date()
  const end = now.toISOString()

  if (period === "all") return {}

  const start = new Date()
  if (period === "week") start.setDate(now.getDate() - 7)
  if (period === "month") start.setMonth(now.getMonth() - 1)
  if (period === "year") start.setFullYear(now.getFullYear() - 1)

  return { start: start.toISOString(), end }
}
