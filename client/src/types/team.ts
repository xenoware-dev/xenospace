import type { Role } from '@/types/auth'

export interface Department {
  _id: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
}

export interface Pagination {
  page: number
  limit: number
  total: number
  pages: number
}

export interface ListUsersParams {
  page?: number
  limit?: number
  search?: string
  role?: Role
  department?: string
  status?: 'active' | 'inactive'
}
