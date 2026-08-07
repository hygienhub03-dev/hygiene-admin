import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  deriveShipmentStatus,
  shouldNotifyShipmentChange,
  shouldNotifyOrderStatusChange,
} from '../order-status'

describe('deriveShipmentStatus', () => {
  it('implies shipment_status="shipped" when orderStatus is "shipped"', () => {
    assert.equal(deriveShipmentStatus('shipped', undefined), 'shipped')
  })

  it('implies shipment_status="delivered" when orderStatus is "delivered"', () => {
    assert.equal(deriveShipmentStatus('delivered', undefined), 'delivered')
  })

  it('does not imply a shipment status for other order statuses', () => {
    assert.equal(deriveShipmentStatus('processing', undefined), undefined)
    assert.equal(deriveShipmentStatus('cancelled', undefined), undefined)
    assert.equal(deriveShipmentStatus('waiting', undefined), undefined)
  })

  it('an explicit shipmentStatus always wins over the implied one', () => {
    assert.equal(deriveShipmentStatus('shipped', 'packed'), 'packed')
  })

  it('handles no orderStatus and no explicit shipmentStatus', () => {
    assert.equal(deriveShipmentStatus(undefined, undefined), undefined)
  })
})

describe('shouldNotifyShipmentChange', () => {
  it('notifies on a fresh transition to shipped', () => {
    assert.equal(shouldNotifyShipmentChange('shipped', 'processing'), true)
  })

  it('notifies on a fresh transition to delivered', () => {
    assert.equal(shouldNotifyShipmentChange('delivered', 'shipped'), true)
  })

  it('does not re-notify if shipment status is unchanged', () => {
    assert.equal(shouldNotifyShipmentChange('shipped', 'shipped'), false)
  })

  it('does not notify for statuses without an email template', () => {
    assert.equal(shouldNotifyShipmentChange('packed', 'processing'), false)
    assert.equal(shouldNotifyShipmentChange('out_for_delivery', 'packed'), false)
  })

  it('does not notify when there is no new shipment status', () => {
    assert.equal(shouldNotifyShipmentChange(undefined, 'processing'), false)
  })

  it('treats a null previous status as a real transition', () => {
    assert.equal(shouldNotifyShipmentChange('shipped', null), true)
  })
})

describe('shouldNotifyOrderStatusChange', () => {
  it('notifies on transition into processing', () => {
    assert.equal(shouldNotifyOrderStatusChange('processing', 'waiting'), true)
  })

  it('notifies on transition into shipped / delivered', () => {
    assert.equal(shouldNotifyOrderStatusChange('shipped', 'processing'), true)
    assert.equal(shouldNotifyOrderStatusChange('delivered', 'shipped'), true)
  })

  it('does not re-notify the same status', () => {
    assert.equal(shouldNotifyOrderStatusChange('processing', 'processing'), false)
  })

  it('ignores non-notifiable statuses', () => {
    assert.equal(shouldNotifyOrderStatusChange('waiting', null), false)
    assert.equal(shouldNotifyOrderStatusChange('cancelled', 'processing'), false)
  })
})
