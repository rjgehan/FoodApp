FROM node:22-alpine AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Vite inlines this into the static bundle at build time — there's no runtime env var to change
# afterward, so the production backend URL has to be known here.
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

FROM nginx:alpine
COPY --from=build /build/dist /usr/share/nginx/html
# A template, not conf.d: the base image runs envsubst over /etc/nginx/templates at startup,
# which is how ${NGINX_LOCAL_RESOLVERS} gets filled in from the real resolv.conf.
# 15-local-resolvers.envsh returns early unless this is set, leaving ${NGINX_LOCAL_RESOLVERS}
# literal in the config and nginx refusing to start. It is opt-in, not automatic.
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 80
