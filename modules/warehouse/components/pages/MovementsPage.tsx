'use client'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/shadcn/data-table'
import { useMovements } from '../../hooks/useMovements'

export function MovementsPage() {
  const { movements, loading } = useMovements()

  if (loading) return <div className="p-8 text-center">Loading movements…</div>

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Stock Movements</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>Delta</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Order</TableHead>
            <TableHead>Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {movements.map(m => (
            <TableRow key={m.id}>
              <TableCell className="font-mono text-xs">{m.product_id.slice(0, 8)}…</TableCell>
              <TableCell className={m.delta < 0 ? 'text-red-600' : 'text-green-600'}>
                {m.delta > 0 ? '+' : ''}{m.delta}
              </TableCell>
              <TableCell>
                <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700">
                  {m.reason}
                </span>
              </TableCell>
              <TableCell className="font-mono text-xs">{m.order_id ? m.order_id.slice(0, 8) + '…' : '—'}</TableCell>
              <TableCell>{new Date(m.created_at).toLocaleDateString()}</TableCell>
            </TableRow>
          ))}
          {movements.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                No movements recorded
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
