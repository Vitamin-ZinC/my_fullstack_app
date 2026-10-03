FROM node:24.21.0-alpine AS vips
RUN apk add --no-cache build-base python3 meson ninja pkgconf curl glib-dev expat-dev libjpeg-turbo-dev libpng-dev libwebp-dev
RUN curl -fsSL https://github.com/libvips/libvips/releases/download/v8.18.7/vips-8.18.7.tar.xz -o /tmp/vips.tar.xz \
    && echo '5baaead3b0bb20ffdb9e9ff09aa9fda08620923df77b63b436654cb5e0b3bf94  /tmp/vips.tar.xz' | sha256sum -c - \
    && tar -xJf /tmp/vips.tar.xz -C /tmp \
    && meson setup /tmp/vips-8.18.7/build /tmp/vips-8.18.7 --prefix=/opt/vips --libdir=lib --buildtype=release -Dauto_features=disabled -Djpeg=enabled -Dpng=enabled -Dwebp=enabled \
    && meson compile -C /tmp/vips-8.18.7/build -j 2 \
    && meson install -C /tmp/vips-8.18.7/build

FROM vips AS deps
WORKDIR /repo
ENV PKG_CONFIG_PATH=/opt/vips/lib/pkgconfig
ENV LD_LIBRARY_PATH=/opt/vips/lib
COPY package.json package-lock.json* ./
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci --workspace apps/frontend --workspace packages/contracts
RUN npm explore sharp -- npm run build

FROM node:24.21.0-alpine AS builder
WORKDIR /repo
RUN apk add --no-cache glib expat libjpeg-turbo libpng libwebp libwebpmux libwebpdemux
COPY --from=vips /opt/vips/lib /opt/vips/lib
ENV LD_LIBRARY_PATH=/opt/vips/lib
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
RUN npm run test:image-runtime
RUN npm --workspace apps/frontend run build

FROM node:24.21.0-alpine
WORKDIR /repo
RUN apk add --no-cache glib expat libjpeg-turbo libpng libwebp libwebpmux libwebpdemux
COPY --from=vips /opt/vips/lib /opt/vips/lib
ENV LD_LIBRARY_PATH=/opt/vips/lib
ENV NODE_ENV=production
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
COPY --from=builder /repo .
EXPOSE 3000
CMD ["npm", "--workspace", "apps/frontend", "run", "start"]
