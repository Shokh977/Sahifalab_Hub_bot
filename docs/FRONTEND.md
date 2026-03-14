# SAHIFALAB Frontend Guide

## Overview
The frontend is a React-based Telegram Mini App that integrates with the Telegram Web App SDK.

## Getting Started

### Installation
```bash
cd frontend
npm install
```

### Development
```bash
npm run dev
```

Visit `http://localhost:3000`

### Build
```bash
npm run build
```

### Preview Build
```bash
npm run preview
```

## Project Structure

```
src/
├── components/        # Reusable React components
├── pages/            # Page-level components
├── hooks/            # Custom React hooks
│   └── useTelegramWebApp.ts  # Telegram SDK integration
├── services/         # API service calls
│   └── apiService.ts         # Axios instance with interceptors
├── context/          # Global state management (Zustand)
├── utils/            # Utility functions
├── styles/           # Global CSS/Tailwind styles
└── App.tsx          # Main App component
```

## Tailwind CSS

Custom theme colors are configured in `tailwind.config.js`:
- `sahifa.*` colors for brand
- `telegram` color for Telegram integration

## Telegram Web App Integration

### Using the Hook
```typescript
import { useTelegramWebApp } from '@hooks/useTelegramWebApp'

function MyComponent() {
  const { webApp, user } = useTelegramWebApp()
  
  return (
    <div>
      <p>Welcome {user?.first_name}!</p>
    </div>
  )
}
```

### API Service
```typescript
import apiService from '@services/apiService'

// Get products
const products = await apiService.getProducts(0, 10)

// Create order
const order = await apiService.createOrder(orderData)
```

## State Management

Using Zustand for global state:
```typescript
import { useCartStore, useUserStore } from '@context/store'

function Component() {
  const { items, total } = useCartStore()
  const { userId } = useUserStore()
}
```

## Environment Variables

Create `.env` file:
```
VITE_API_URL=http://localhost:8000
VITE_APP_NAME=SAHIFALAB
VITE_TELEGRAM_BOT_TOKEN=your_token_here
```

## Components to Create

Recommended components structure:
```
components/
├── Header.tsx         # Top navigation
├── Footer.tsx         # Bottom navigation
├── ProductCard.tsx    # Product display
├── CartItem.tsx       # Cart item component
├── OrderCard.tsx      # Order display
├── Button.tsx         # Reusable button
├── Loading.tsx        # Loading spinner
└── Modal.tsx          # Modal component

pages/
├── HomePage.tsx       # Home/products list
├── ProductPage.tsx    # Product detail
├── CartPage.tsx       # Shopping cart
├── OrdersPage.tsx     # User orders
└── CheckoutPage.tsx   # Checkout flow
```

## Best Practices

1. Use TypeScript for type safety
2. Component composition over duplication
3. Responsive design with Tailwind
4. Error boundaries for stability
5. Loading states for API calls
6. Proper key props in lists
7. Memoize expensive computations

## Testing

```bash
npm test
```

## Deployment

Frontend can be deployed to:
- Vercel
- Netlify
- GitHub Pages
- Docker container

Build is optimized for production:
```bash
npm run build
```

Output will be in `dist/` folder.
