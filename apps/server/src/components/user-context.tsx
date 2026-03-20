'use client'

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export interface User {
  id: string | number
  email?: string
  [key: string]: unknown
}

interface UserContextType {
  user: User | null
  isLoading: boolean
  refreshUser: () => Promise<void>
  clearUser: () => void
}

const UserContext = createContext<UserContextType>({
  user: null,
  isLoading: true,
  refreshUser: async () => {},
  clearUser: () => {}
})

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchUser = useCallback(async () => {
    try {
      const response = await fetch('/api/users/me', {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      })

      if (response.ok) {
        const data = await response.json()
        setUser((data?.user as User) || null)
      } else {
        setUser(prev => (prev === null ? prev : null))
      }
    } catch (error) {
      console.error('[UserContext] Error fetching user:', error)
      setUser(prev => (prev === null ? prev : null))
    } finally {
      setIsLoading(false)
    }
  }, [])

  const refreshUser = useCallback(async () => {
    setIsLoading(true)
    await fetchUser()
  }, [fetchUser])

  const clearUser = useCallback(() => {
    setUser(null)
  }, [])

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  const value = useMemo(() => ({ user, isLoading, refreshUser, clearUser }), [user, isLoading, refreshUser, clearUser])

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

export const useUser = () => useContext(UserContext)
