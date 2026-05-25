import { emailLayout } from './layout'

export function shippingUpdateEmail(order: {
  id: string
  customerName: string
  carrier?: string
  trackingNumber?: string
  status: string
}): string {
  return emailLayout(
    'Shipping Update',
    `
    <h2 style="margin:0 0 8px;color:#111827;font-size:20px;">Shipping Update</h2>
    <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">Hi ${order.customerName}, your order status has been updated.</p>

    <div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:16px;border-radius:0 8px 8px 0;margin-bottom:24px;">
      <p style="margin:0;color:#15803d;font-size:16px;font-weight:600;">${order.status}</p>
      ${order.carrier ? `<p style="margin:8px 0 0;color:#166534;font-size:14px;">Carrier: ${order.carrier}</p>` : ''}
      ${order.trackingNumber ? `<p style="margin:4px 0 0;color:#166534;font-size:14px;">Tracking: ${order.trackingNumber}</p>` : ''}
    </div>

    <p style="margin:0;color:#6b7280;font-size:14px;">Order #${order.id.slice(0, 8)}</p>
    `
  )
}

export function orderConfirmationEmail(order: {
  id: string
  total: number
  items: { name: string; quantity: number; price: number }[]
  customerName: string
}): string {
  const itemsHtml = order.items
    .map(
      (item) => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;color:#111827;font-size:14px;">${item.name}</td>
      <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;font-size:14px;text-align:center;">${item.quantity}</td>
      <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;color:#111827;font-size:14px;text-align:right;">R${item.price.toFixed(2)}</td>
    </tr>`
    )
    .join('')

  return emailLayout(
    'Order Confirmed',
    `
    <h2 style="margin:0 0 8px;color:#111827;font-size:20px;">Thank you for your order, ${order.customerName}!</h2>
    <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">Your order has been confirmed and is being processed.</p>

    <div style="background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:24px;">
      <p style="margin:0;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Order ID</p>
      <p style="margin:4px 0 0;color:#111827;font-size:16px;font-weight:600;">#${order.id.slice(0, 8)}</p>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <thead>
        <tr>
          <th style="padding:8px 0;text-align:left;color:#9ca3af;font-size:12px;text-transform:uppercase;">Item</th>
          <th style="padding:8px 0;text-align:center;color:#9ca3af;font-size:12px;text-transform:uppercase;">Qty</th>
          <th style="padding:8px 0;text-align:right;color:#9ca3af;font-size:12px;text-transform:uppercase;">Price</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>

    <div style="border-top:2px solid #111827;padding-top:16px;text-align:right;">
      <span style="color:#111827;font-size:18px;font-weight:700;">Total: R${order.total.toFixed(2)}</span>
    </div>
    `
  )
}
