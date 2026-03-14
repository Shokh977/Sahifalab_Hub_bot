# SAHIFALAB Telegram Mini App (TMA)

A full-stack Telegram Mini App built with React, FastAPI, and PostgreSQL for e-commerce operations.

## 🏗️ Architecture Overview

```
SAHIFALAB Telegram Mini App
├── Frontend (React + Tailwind + Telegram SDK)
├── Backend (FastAPI + PostgreSQL + SQLAlchemy)
├── Bot (Python Telegram Bot for Notifications)
└── Database (PostgreSQL)
```

## 📋 Tech Stack

### Frontend
- **React 18.2** - UI framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Vite** - Build tool
- **Telegram Web App SDK** - Integration with Telegram
- **Zustand** - State management
- **Axios** - HTTP client

### Backend
- **FastAPI** - Web framework
- **PostgreSQL** - Database
- **SQLAlchemy** - ORM
- **Pydantic** - Data validation
- **Uvicorn** - ASGI server

### Bot
- **python-telegram-bot** - Telegram Bot API wrapper
- **AsyncIO** - Asynchronous programming

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose (recommended)
- OR Python 3.11+, Node.js 20+, PostgreSQL 15+

### Installation with Docker

1. Clone the repository:
```bash
cd "d:\My Data\Coding\SAHIFALAB\Telegram App"
```

2. Create environment files:
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
cp bot/.env.example bot/.env
```

3. Update `.env` files with your configuration:
   - `TELEGRAM_BOT_TOKEN`: Get from [@BotFather](https://t.me/botfather)
   - Database credentials
   - API URLs

4. Start services:
```bash
docker-compose up -d
```

5. Access services:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Documentation: http://localhost:8000/docs

### Manual Installation

#### Backend Setup
```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env

# Initialize database
python -c "from app.db.session import init_db; init_db()"

# Run server
uvicorn app.main:app --reload
```

#### Frontend Setup
```bash
cd frontend

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Run development server
npm run dev
```

#### Bot Setup
```bash
cd bot

# Create virtual environment
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env

# Run bot
python main.py
```

## 📁 Project Structure

```
SAHIFALAB/
├── frontend/
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── pages/          # Page components
│   │   ├── hooks/          # Custom hooks (Telegram SDK)
│   │   ├── services/       # API services
│   │   ├── context/        # State management (Zustand)
│   │   ├── utils/          # Utility functions
│   │   └── styles/         # Global styles
│   ├── public/             # Static assets
│   └── index.html          # Entry HTML
│
├── backend/
│   ├── app/
│   │   ├── main.py         # FastAPI app initialization
│   │   ├── api/
│   │   │   └── v1/
│   │   │       ├── endpoints/
│   │   │       │   ├── users.py
│   │   │       │   ├── products.py
│   │   │       │   ├── orders.py
│   │   │       │   └── cart.py
│   │   │       └── __init__.py
│   │   ├── core/
│   │   │   └── config.py   # Configuration settings
│   │   ├── db/
│   │   │   └── session.py  # Database session management
│   │   ├── models/
│   │   │   └── models.py   # SQLAlchemy models
│   │   ├── schemas/
│   │   │   └── schemas.py  # Pydantic schemas
│   │   ├── services/
│   │   │   ├── user_service.py
│   │   │   ├── product_service.py
│   │   │   ├── order_service.py
│   │   │   └── cart_service.py
│   │   └── utils/
│   ├── migrations/         # Alembic migrations
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
│
├── bot/
│   ├── bot.py              # Telegram bot handler
│   ├── main.py             # Bot entry point
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
│
└── docs/                   # Documentation
```

## 🗄️ Database Schema

### Users Table
- `id` - Primary key
- `telegram_id` - Unique Telegram ID
- `username` - Username
- `first_name`, `last_name` - Name fields
- `email` - Email address
- `phone` - Phone number
- `is_active` - User status
- `created_at`, `updated_at` - Timestamps

### Products Table
- `id` - Primary key
- `name` - Product name
- `slug` - URL-friendly identifier
- `description` - Product description
- `price` - Product price
- `discount_price` - Discounted price
- `image_url` - Product image
- `category` - Product category
- `stock` - Available quantity
- `is_available` - Availability status

### Orders Table
- `id` - Primary key
- `user_id` - Foreign key to Users
- `order_number` - Unique order number
- `status` - Order status (pending, processing, shipped, delivered)
- `total_amount` - Total price
- `tax_amount` - Tax amount
- `shipping_cost` - Shipping cost
- `created_at`, `updated_at` - Timestamps
- `delivered_at` - Delivery timestamp

### OrderItems Table
- `id` - Primary key
- `order_id` - Foreign key to Orders
- `product_id` - Foreign key to Products
- `quantity` - Ordered quantity
- `price` - Price at time of order

### Cart Table
- `id` - Primary key
- `user_id` - Foreign key to Users
- `created_at`, `updated_at` - Timestamps

### Addresses Table
- `id` - Primary key
- `user_id` - Foreign key to Users
- `label` - Address label (Home, Work, etc)
- `street`, `city`, `state`, `postal_code`, `country` - Address fields
- `is_default` - Default address flag

### Notifications Table
- `id` - Primary key
- `user_id` - Foreign key to Users
- `title` - Notification title
- `message` - Notification message
- `notification_type` - Type (order_update, promotion, etc)
- `is_read` - Read status

## 🔌 API Endpoints

### Users
- `POST /api/users` - Create new user
- `GET /api/users/{user_id}` - Get user profile
- `PUT /api/users/{user_id}` - Update user
- `DELETE /api/users/{user_id}` - Delete user
- `GET /api/users/{user_id}/orders` - Get user orders

### Products
- `GET /api/products` - List products (paginated)
- `GET /api/products/{product_id}` - Get product details
- `GET /api/products/search?q=query` - Search products
- `GET /api/products/category/{category}` - Get products by category
- `POST /api/products` - Create product (Admin)
- `PUT /api/products/{product_id}` - Update product (Admin)
- `DELETE /api/products/{product_id}` - Delete product (Admin)

### Orders
- `POST /api/orders` - Create new order
- `GET /api/orders/{order_id}` - Get order details
- `GET /api/orders` - List orders (paginated)
- `PUT /api/orders/{order_id}?status=value` - Update order status
- `DELETE /api/orders/{order_id}` - Cancel order

### Cart
- `GET /api/cart/{user_id}` - Get user cart
- `POST /api/cart/{user_id}` - Add item to cart
- `DELETE /api/cart/{user_id}/{product_id}` - Remove from cart
- `DELETE /api/cart/{user_id}` - Clear cart

## 🤖 Telegram Bot Commands

- `/start` - Start the bot
- `/help` - Show help message
- `/app` - Open the mini app
- `/orders` - View your orders
- `/support` - Contact support

## 🔐 Security Considerations

1. **Environment Variables**: Store sensitive data in `.env` files
2. **CORS Configuration**: Configure allowed origins in `settings`
3. **Authentication**: JWT tokens (implement in production)
4. **HTTPS**: Use HTTPS in production
5. **Database**: Use strong passwords and parameterized queries
6. **Rate Limiting**: Implement rate limiting for API endpoints
7. **Input Validation**: All inputs validated with Pydantic

## 🧪 Testing

### Backend Tests
```bash
cd backend
pytest
```

### Frontend Tests
```bash
cd frontend
npm test
```

## 📦 Deployment

### Using Docker Compose
```bash
docker-compose -f docker-compose.yml up -d
```

### Using Kubernetes (Future)
Kubernetes manifests can be added for production deployment.

### Environment Variables for Production
```
DATABASE_URL=postgresql://user:pass@prod-db:5432/sahifalab
DEBUG=False
SECRET_KEY=your-production-secret-key
ALLOWED_HOSTS=yourdomain.com
CORS_ORIGINS=["https://yourdomain.com"]
TELEGRAM_BOT_TOKEN=your-bot-token
```

## 🔄 Development Workflow

1. Create a branch: `git checkout -b feature/your-feature`
2. Make changes and test locally
3. Commit changes: `git commit -m "description"`
4. Push to repository: `git push origin feature/your-feature`
5. Create a Pull Request

## 🐛 Troubleshooting

### Database Connection Issues
- Ensure PostgreSQL is running
- Check DATABASE_URL in .env
- Verify database credentials

### Telegram Bot Not Responding
- Verify TELEGRAM_BOT_TOKEN is correct
- Check bot has webhook/polling set up
- Ensure backend is accessible

### Frontend Not Loading Mini App
- Check VITE_API_URL points to correct backend
- Verify Telegram Web App SDK is loaded
- Check browser console for errors

## 📞 Support

For support, please contact:
- Email: support@sahifalab.com
- Issue Tracker: GitHub Issues
- Documentation: /docs

## 📄 License

This project is licensed under the MIT License - see LICENSE file for details.

## 🙏 Acknowledgments

- FastAPI documentation
- React documentation
- Telegram Bot API
- Community contributors
