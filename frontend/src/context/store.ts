import { create } from 'zustand'

interface CartItem {
  product_id: number
  quantity: number
  product: {
    id: number
    name: string
    price: number
    description?: string
  }
}

interface CartStore {
  items: CartItem[]
  total: number
  addItem: (item: CartItem) => void
  removeItem: (productId: number) => void
  updateQuantity: (productId: number, quantity: number) => void
  clearCart: () => void
}

export const useCartStore = create<CartStore>((set) => ({
  items: [],
  total: 0,

  addItem: (item) =>
    set((state) => {
      const existingItem = state.items.find((i) => i.product_id === item.product_id)
      let newItems

      if (existingItem) {
        newItems = state.items.map((i) =>
          i.product_id === item.product_id ? { ...i, quantity: i.quantity + item.quantity } : i
        )
      } else {
        newItems = [...state.items, item]
      }

      const total = newItems.reduce((sum, i) => sum + i.product.price * i.quantity, 0)
      return { items: newItems, total }
    }),

  removeItem: (productId) =>
    set((state) => {
      const newItems = state.items.filter((i) => i.product_id !== productId)
      const total = newItems.reduce((sum, i) => sum + i.product.price * i.quantity, 0)
      return { items: newItems, total }
    }),

  updateQuantity: (productId, quantity) =>
    set((state) => {
      const newItems = state.items
        .map((i) => (i.product_id === productId ? { ...i, quantity } : i))
        .filter((i) => i.quantity > 0)
      const total = newItems.reduce((sum, i) => sum + i.product.price * i.quantity, 0)
      return { items: newItems, total }
    }),

  clearCart: () => set({ items: [], total: 0 }),
}))

interface UserStore {
  userId: number | null
  username?: string
  firstName?: string
  lastName?: string
  setUser: (user: { id: number; username?: string; firstName?: string; lastName?: string }) => void
  clearUser: () => void
}

export const useUserStore = create<UserStore>((set) => ({
  userId: null,
  username: '',
  firstName: '',
  lastName: '',

  setUser: (user) =>
    set(() => ({
      userId: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
    })),

  clearUser: () =>
    set({
      userId: null,
      username: '',
      firstName: '',
      lastName: '',
    }),
}))
