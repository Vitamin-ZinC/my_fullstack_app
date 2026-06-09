FROM node:20-alpine AS deps
WORKDIR /repo
RUN apk add --no-cache openssl
COPY package.json package-lock.json* ./
COPY apps/backend/package.json apps/backend/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm install

FROM node:20-alpine
WORKDIR /repo
RUN apk add --no-cache openssl
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
ENV DATABASE_URL=postgresql://user:password@localhost:5432/db
RUN npm --workspace apps/backend run prisma:generate
RUN npm --workspace apps/backend run build
EXPOSE 3001
CMD ["npm", "--workspace", "apps/backend", "run", "start"]
