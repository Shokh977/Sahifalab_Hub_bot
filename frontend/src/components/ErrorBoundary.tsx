import React, { ReactNode, ErrorInfo, useState, useCallback } from 'react'

interface ToastMessage {
  id: string
  type: 'success' | 'error' | 'info' | 'warning'
  message: string
  duration?: number
}

// Global toast state management
let toastListeners: ((toast: ToastMessage) => void)[] = []
let toastIdCounter = 0

export const showToast = (
  message: string,
  type: 'success' | 'error' | 'info' | 'warning' = 'info',
  duration: number = 3000,
) => {
  const toast: ToastMessage = {
    id: `toast-${toastIdCounter++}`,
    type,
    message,
    duration,
  }
  toastListeners.forEach(listener => listener(toast))
}

// Toast Container Component
export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  React.useEffect(() => {
    const handleToast = (toast: ToastMessage) => {
      setToasts(prev => [...prev, toast])

      if (toast.duration && toast.duration > 0) {
        setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== toast.id))
        }, toast.duration)
      }
    }

    toastListeners.push(handleToast)
    return () => {
      toastListeners = toastListeners.filter(l => l !== handleToast)
    }
  }, [])

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm">
      {toasts.map(toast => (
        <Toast key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  )
}

const Toast: React.FC<{
  toast: ToastMessage
  onRemove: (id: string) => void
}> = ({ toast, onRemove }) => {
  const styles = {
    success: 'bg-green-500 text-white',
    error: 'bg-red-500 text-white',
    info: 'bg-blue-500 text-white',
    warning: 'bg-yellow-500 text-white',
  }

  const icons = {
    success: '✅',
    error: '❌',
    info: 'ℹ️',
    warning: '⚠️',
  }

  return (
    <div
      className={`${styles[toast.type]} px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-slideIn`}
      role="alert"
    >
      <span className="text-lg">{icons[toast.type]}</span>
      <span className="flex-1 text-sm font-medium">{toast.message}</span>
      <button
        onClick={() => onRemove(toast.id)}
        className="text-lg font-bold hover:opacity-75 transition-opacity"
      >
        ✕
      </button>
    </div>
  )
}

// Error Boundary Component
interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo)
    showToast('Something went wrong. Please refresh the page.', 'error')
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
          <div className="max-w-md w-full text-center space-y-4">
            <div className="text-6xl">⚠️</div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Oops! Something went wrong
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 rounded-xl font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              🔄 Refresh Page
            </button>
            <button
              onClick={() => window.history.back()}
              className="w-full py-2 rounded-xl font-semibold bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              ← Go Back
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

// Loading skeleton component
export const SkeletonLoader: React.FC<{ count?: number; height?: string }> = ({
  count = 3,
  height = 'h-12',
}) => (
  <div className="space-y-3">
    {Array.from({ length: count }).map((_, i) => (
      <div
        key={i}
        className={`${height} bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse`}
      />
    ))}
  </div>
)
