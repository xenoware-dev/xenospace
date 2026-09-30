import axios from 'axios'

export const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

let isRefreshing = false
let pendingQueue: Array<() => void> = []

const AUTH_ENDPOINTS = ['/auth/login', '/auth/register', '/auth/refresh-token']

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    const requestUrl: string = originalRequest?.url ?? ''

    const isAuthEndpoint = AUTH_ENDPOINTS.some((endpoint) => requestUrl.includes(endpoint))

    if (error.response?.status !== 401 || isAuthEndpoint || originalRequest._retry) {
      return Promise.reject(error)
    }

    originalRequest._retry = true

    if (isRefreshing) {
      return new Promise((resolve) => {
        pendingQueue.push(() => resolve(api(originalRequest)))
      })
    }

    isRefreshing = true
    try {
      await api.post('/auth/refresh-token')
      pendingQueue.forEach((resolve) => resolve())
      pendingQueue = []
      return api(originalRequest)
    } catch (refreshError) {
      pendingQueue = []
      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  }
)
