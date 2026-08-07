import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mapOrder } from '../order-mapper'

describe('mapOrder', () => {
  it('maps snake_case DB columns to the camelCase DTO the UI expects', () => {
    const dto = mapOrder({
      id: 'order-1',
      user_id: 'user-1',
      user_email: 'a@b.com',
      status: 'shipped',
      shipment_status: 'shipped',
      tracking_number: 'TRK1',
      carrier: 'CourierCo',
      payment_status: 'paid',
      payment_method: 'paystack',
      total_amount: '199.50',
      delivery_method: 'door',
      shipping_cost: '70',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
      payment_reference: 'ref-1',
      shipping_address: { city: 'Joburg' },
    })

    assert.equal(dto.trackingNumber, 'TRK1')
    assert.equal(dto.carrier, 'CourierCo')
    assert.equal(dto.totalAmount, 199.5)
    assert.equal(dto.shippingCost, 70)
  })

  it('defaults deliveryMethod to "door" when missing', () => {
    const dto = mapOrder({ id: 'order-1' })
    assert.equal(dto.deliveryMethod, 'door')
  })

  it('maps order_items and order_status_events when present', () => {
    const dto = mapOrder({
      id: 'order-1',
      order_items: [{ product_id: 'p1', product_name: 'Soap', product_image_url: null, unit_price: 10, quantity: 2 }],
      order_status_events: [{ id: 'e1', status: 'shipped', shipment_status: 'shipped', note: 'note', created_at: '2026-01-01' }],
    })

    assert.equal(dto.cartItems.length, 1)
    assert.equal(dto.cartItems[0].title, 'Soap')
    assert.equal(dto.statusEvents.length, 1)
    assert.equal(dto.statusEvents[0].shipmentStatus, 'shipped')
  })

  it('returns empty arrays when order_items/order_status_events are absent (list-route case)', () => {
    const dto = mapOrder({ id: 'order-1' })
    assert.deepEqual(dto.cartItems, [])
    assert.deepEqual(dto.statusEvents, [])
  })
})
