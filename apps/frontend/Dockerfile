FROM node:20-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm install

FROM node:20-alpine AS builder
WORKDIR /repo
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
RUN npm --workspace apps/frontend run build

FROM node:20-alpine
WORKDIR /repo
ENV NODE_ENV=production
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
COPY --from=builder /repo .
EXPOSE 3000
CMD ["npm", "--workspace", "apps/frontend", "run", "start"]
