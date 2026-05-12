'use client'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/shadcn/data-table'
import { Progress } from '@/components/ui/shadcn/progress'
import { useStock } from '../../hooks/useStock'

export function StockPage() {
  const { stock, loading } = useStock()

  if (loading) return <div className="p-8 text-center">Loading stock…</div>

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Stock Levels</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product ID</TableHead>
            <TableHead>Quantity</TableHead>
            <TableHead className="w-48">Level</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {stock.map(row => {
            const pct = Math.min(100, (row.qty / Math.max(row.low_threshold * 3, 1)) * 100)
            const isLow = row.qty <= row.low_threshold
            return (
              <TableRow key={row.product_id}>
                <TableCell className="font-mono text-xs">{row.product_id.slice(0, 8)}…</TableCell>
                <TableCell>{row.qty}</TableCell>
                <TableCell>
                  <Progress value={pct} className="h-2" />
                </TableCell>
                <TableCell>
                  {isLow ? (
                    <span className="px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800">
                      Low
                    </span>
                  ) : (
                    <span className="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                      OK
                    </span>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
          {stock.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                No stock records
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
