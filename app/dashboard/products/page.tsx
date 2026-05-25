'use client'

import { useState, useRef } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Upload, Download, FileSpreadsheet, CheckCircle, AlertCircle } from 'lucide-react'

export default function ProductsBulkPage() {
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await fetch('/api/products/export')
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `products-${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
      setResult({ type: 'success', message: 'Products exported successfully' })
    } catch {
      setResult({ type: 'error', message: 'Failed to export products' })
    } finally {
      setExporting(false)
    }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    setResult(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/products/import', { method: 'POST', body: formData })
      const data = await res.json()

      if (res.ok) {
        setResult({ type: 'success', message: `Imported ${data.imported} products successfully` })
      } else {
        setResult({ type: 'error', message: data.error || 'Import failed' })
      }
    } catch {
      setResult({ type: 'error', message: 'Failed to import products' })
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Bulk Product Management</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Export */}
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Download className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold">Export Products</h2>
              <p className="text-sm text-gray-500">Download all products as CSV</p>
            </div>
          </div>
          <Button onClick={handleExport} disabled={exporting} className="w-full">
            {exporting ? 'Exporting...' : 'Export CSV'}
          </Button>
        </Card>

        {/* Import */}
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Upload className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <h2 className="font-semibold">Import Products</h2>
              <p className="text-sm text-gray-500">Upload CSV to bulk add/update products</p>
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            onChange={handleImport}
            className="hidden"
            id="csv-import"
          />
          <Button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            variant="outline"
            className="w-full"
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            {importing ? 'Importing...' : 'Upload CSV'}
          </Button>
        </Card>
      </div>

      {/* Result */}
      {result && (
        <div className={`flex items-center gap-3 p-4 rounded-lg ${result.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {result.type === 'success' ? <CheckCircle className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
          <p className="text-sm">{result.message}</p>
        </div>
      )}

      {/* CSV Format Guide */}
      <Card className="p-6">
        <h2 className="font-semibold mb-3">CSV Format</h2>
        <p className="text-sm text-gray-500 mb-3">Your CSV file should include these columns:</p>
        <div className="bg-gray-50 rounded-lg p-4 font-mono text-xs overflow-x-auto">
          <code>name,slug,description,price,stock,category,material,color,is_active,featured</code>
        </div>
        <ul className="mt-3 text-sm text-gray-500 space-y-1">
          <li><strong>name</strong> (required) - Product name</li>
          <li><strong>slug</strong> (required) - URL-friendly identifier</li>
          <li><strong>price</strong> (required) - Price in ZAR</li>
          <li><strong>stock</strong> - Inventory count (default: 0)</li>
          <li><strong>category</strong> - Category name (will be matched or created)</li>
        </ul>
      </Card>
    </div>
  )
}
