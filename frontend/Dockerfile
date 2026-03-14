FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy application
COPY . .

# Build for production or run dev
RUN npm run build

# Expose port
EXPOSE 3000

# Run the application
CMD ["npm", "run", "preview"]
