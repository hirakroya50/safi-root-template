import React, { useEffect, useState } from 'react'
import { useAuth } from './AuthProvider'
import { supabase } from '../supabase/client'
import {
  canManage,
  deliveryStatuses,
  paymentStatuses,
  type DeliveryStatus,
  type Order,
  type PaymentStatus,
  type Product,
  type Profile,
} from '../supabase/types'

const schemaHint = 'Run template/supabase/schema.sql in the Supabase SQL editor, then refresh.'

function explain(message: string): string {
  if (/relation .* does not exist|schema cache/i.test(message)) {
    return `${message} ${schemaHint}`
  }
  return message
}

export const ShopDesk: React.FC = () => {
  const { configured, session, refreshKey, refresh, pushToast } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('4.50')
  const [quantity, setQuantity] = useState('12')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [orderProductId, setOrderProductId] = useState('')
  const [orderQuantity, setOrderQuantity] = useState('1')

  useEffect(() => {
    const client = supabase
    if (!client || !session) {
      setProfile(null)
      setProducts([])
      setOrders([])
      return
    }
    let cancelled = false
    const load = async () => {
      const userId = session.user.id
      const profileResult = await client
        .from('profiles')
        .select('id, role, name, email, phone')
        .eq('id', userId)
        .maybeSingle()
      if (cancelled) return
      if (profileResult.error) {
        const message = explain(profileResult.error.message)
        setError(message)
        pushToast('error', message)
        return
      }
      const nextProfile = profileResult.data as Profile | null
      setProfile(nextProfile)

      const productResult = await client
        .from('products')
        .select('id, user_id, title, description, quantity, price')
        .order('title')
      if (cancelled) return
      if (productResult.error) {
        setError(explain(productResult.error.message))
        return
      }
      const nextProducts = (productResult.data ?? []) as Product[]
      setProducts(nextProducts)
      setOrderProductId((current) => current || nextProducts[0]?.id || '')

      let orderQuery = client
        .from('orders')
        .select('id, user_id, payment_status, delivery_status, created_at, order_items(id, title, quantity, unit_price, product_id)')
        .order('created_at', { ascending: false })
      if (!canManage(nextProfile?.role)) {
        orderQuery = orderQuery.eq('user_id', userId)
      }
      const orderResult = await orderQuery
      if (cancelled) return
      if (orderResult.error) {
        setError(explain(orderResult.error.message))
        return
      }
      setOrders((orderResult.data ?? []) as Order[])
      setError('')
    }
    load()
    return () => {
      cancelled = true
    }
  }, [session, refreshKey, pushToast])

  const saveProduct = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!supabase || !profile) return
    setError('')
    const payload = {
      title: title.trim(),
      description: description.trim(),
      price: Number(price),
      quantity: Number(quantity),
    }
    const result = editingId
      ? await supabase.from('products').update(payload).eq('id', editingId)
      : await supabase.from('products').insert({ ...payload, user_id: profile.id })
    if (result.error) {
      setError(explain(result.error.message))
      return
    }
    setTitle('')
    setDescription('')
    setEditingId(null)
    refresh()
  }

  const removeProduct = async (id: string) => {
    if (!supabase) return
    const { error: deleteError } = await supabase.from('products').delete().eq('id', id)
    if (deleteError) {
      setError(explain(deleteError.message))
      return
    }
    refresh()
  }

  const placeOrder = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!supabase || !profile) return
    const product = products.find((item) => item.id === orderProductId)
    if (!product) return
    setError('')
    const created = await supabase
      .from('orders')
      .insert({ user_id: profile.id })
      .select('id')
      .single()
    if (created.error || !created.data) {
      setError(explain(created.error?.message ?? 'Could not create the order'))
      return
    }
    const item = await supabase.from('order_items').insert({
      order_id: created.data.id,
      product_id: product.id,
      title: product.title,
      quantity: Number(orderQuantity),
      unit_price: product.price,
    })
    if (item.error) {
      setError(explain(item.error.message))
      return
    }
    refresh()
  }

  const updateStatus = async (
    orderId: string,
    patch: { payment_status?: PaymentStatus; delivery_status?: DeliveryStatus },
  ) => {
    if (!supabase) return
    const { error: updateError } = await supabase.from('orders').update(patch).eq('id', orderId)
    if (updateError) {
      setError(explain(updateError.message))
      return
    }
    refresh()
  }

  if (configured && !session) return null

  return (
    <section className="safi-desk" id="desk" aria-labelledby="desk-title">
      <h2 id="desk-title">Account</h2>
      {!configured ? (
        <p className="safi-empty">
          Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, then run template/supabase/schema.sql
          in the Supabase SQL editor.
        </p>
      ) : null}

      {profile ? (
        <p className="safi-desk-identity">
          {profile.name || profile.email} · {profile.role}
        </p>
      ) : null}

      {error ? <p className="safi-error">{error}</p> : null}

      {profile && canManage(profile.role) ? (
        <form className="safi-form" onSubmit={saveProduct}>
          <h3>{editingId ? 'Edit product' : 'New product'}</h3>
          <label className="safi-field">
            Title
            <input required value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="safi-field">
            Description
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
          </label>
          <label className="safi-field">
            Price
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
          </label>
          <label className="safi-field">
            Quantity
            <input
              required
              type="number"
              min="0"
              step="1"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </label>
          <button className="safi-button" type="submit">
            {editingId ? 'Save product' : 'Add product'}
          </button>
        </form>
      ) : null}

      {session && products.length > 0 ? (
        <ul className="safi-record-list">
          {products.map((product) => (
            <li key={product.id}>
              <h3>{product.title}</h3>
              <p>{product.description}</p>
              <p>
                ${Number(product.price).toFixed(2)} · {product.quantity} in stock
              </p>
              {canManage(profile?.role) ? (
                <div className="safi-form-actions">
                  <button
                    className="safi-button safi-button-quiet"
                    type="button"
                    onClick={() => {
                      setEditingId(product.id)
                      setTitle(product.title)
                      setDescription(product.description)
                      setPrice(String(product.price))
                      setQuantity(String(product.quantity))
                    }}
                  >
                    Edit
                  </button>
                  <button className="safi-button safi-button-quiet" type="button" onClick={() => removeProduct(product.id)}>
                    Delete
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {profile && products.length > 0 ? (
        <form className="safi-form" onSubmit={placeOrder}>
          <h3>Place an order</h3>
          <label className="safi-field">
            Product
            <select value={orderProductId} onChange={(event) => setOrderProductId(event.target.value)}>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.title}
                </option>
              ))}
            </select>
          </label>
          <label className="safi-field">
            Quantity
            <input
              type="number"
              min="1"
              step="1"
              value={orderQuantity}
              onChange={(event) => setOrderQuantity(event.target.value)}
            />
          </label>
          <button className="safi-button" type="submit">
            Place order
          </button>
        </form>
      ) : null}

      {session && orders.length > 0 ? (
        <ul className="safi-record-list">
          {orders.map((order) => (
            <li key={order.id}>
              <h3>Order {order.id.slice(0, 8)}</h3>
              <ul>
                {order.order_items.map((item) => (
                  <li key={item.id}>
                    {item.quantity} × {item.title} · ${Number(item.unit_price).toFixed(2)}
                  </li>
                ))}
              </ul>
              {canManage(profile?.role) ? (
                <div className="safi-form-actions">
                  <label className="safi-field">
                    Payment
                    <select
                      value={order.payment_status}
                      onChange={(event) =>
                        updateStatus(order.id, { payment_status: event.target.value as PaymentStatus })
                      }
                    >
                      {paymentStatuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="safi-field">
                    Delivery
                    <select
                      value={order.delivery_status}
                      onChange={(event) =>
                        updateStatus(order.id, { delivery_status: event.target.value as DeliveryStatus })
                      }
                    >
                      {deliveryStatuses.map((status) => (
                        <option key={status} value={status}>
                          {status.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : (
                <p>
                  {order.payment_status} · {order.delivery_status.replace(/_/g, ' ')}
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
