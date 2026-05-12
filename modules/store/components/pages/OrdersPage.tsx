'use client'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/shadcn/data-table'
import { Badge } from '@/components/ui/shadcn/badge'
import { useOrders } from '../../hooks/useOrders'

const STATUS_VARIANT: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  paid: 'bg-green-100 text-green-800',
  payment_hold: 'bg-orange-100 text-orange-800',
  cancelled: 'bg-red-100 text-red-800',
}

export function OrdersPage() {
  const { orders, loading } = useOrders()

  if (loading) return <div className="p-8 text-center">Loading orders…</div>

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Orders</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map(order => (
            <TableRow key={order.id}>
              <TableCell className="font-mono text-xs">{order.id.slice(0, 8)}…</TableCell>
              <TableCell>{order.customer_id ?? '—'}</TableCell>
              <TableCell>
                <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_VARIANT[order.status] ?? ''}`}>
                  {order.status}
                </span>
              </TableCell>
              <TableCell className="text-right">₮{Number(order.total).toLocaleString()}</TableCell>
              <TableCell>{new Date(order.created_at).toLocaleDateString()}</TableCell>
            </TableRow>
          ))}
          {orders.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                No orders yet
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
