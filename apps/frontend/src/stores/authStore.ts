import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  name: string
  email: string
  role: 'ADMIN' | 'MANAGER' | 'OPERATOR'
}

interface AuthState {
  user: User | null
  accessToken: string | null
  setAuth: (data: { user?: User; accessToken: string }) => void
  logout: () => void
  isAdmin: () => boolean
  isManager: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,

      setAuth: ({ user, accessToken }) => {
        set((state) => ({
          accessToken,
          user: user ?? state.user,
        }))
      },

      logout: () => {
        set({ user: null, accessToken: null })
      },

      isAdmin: () => get().user?.role === 'ADMIN',
      isManager: () => ['ADMIN', 'MANAGER'].includes(get().user?.role ?? ''),
    }),
    {
      name: 'fiscal-auth',
      partialize: (state) => ({
        // Don't persist accessToken (short-lived), only user info
        user: state.user,
      }),
    }
  )
)
