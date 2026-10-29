export type Role = 'admin' | 'manager' | 'member'
export type PaymentStatus = 'unpaid' | 'paid' | 'refunded'
export type DeliveryStatus = 'pending' | 'preparing' | 'out_for_delivery' | 'delivered' | 'cancelled'

export interface Profile {
  id: string
  role: Role
  name: string
  email: string
  phone: string
}

export interface Product {
  id: string
  user_id: string
  title: string
  description: string
  quantity: number
  price: number
}

export interface OrderItem {
  id: string
  title: string
  quantity: number
  unit_price: number
  product_id: string | null
}

export interface Order {
  id: string
  user_id: string
  payment_status: PaymentStatus
  delivery_status: DeliveryStatus
  created_at: string
  order_items: OrderItem[]
}

export const paymentStatuses: PaymentStatus[] = ['unpaid', 'paid', 'refunded']
export const deliveryStatuses: DeliveryStatus[] = [
  'pending',
  'preparing',
  'out_for_delivery',
  'delivered',
  'cancelled',
]

export function canManage(role: Role | undefined): boolean {
  return role === 'admin' || role === 'manager'
}
