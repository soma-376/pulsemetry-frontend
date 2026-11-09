# syntax=docker/dockerfile:1
# 베이스 이미지는 multi-arch index digest로 고정한다. 상위 이미지 갱신이 Docker 레이어 캐시를 예고 없이 무효화하지 않게 하고,
# 갱신은 Dependabot PR(.github/dependabot.yml)로 검증한 뒤 반영한다. 두 FROM의 digest는 같아야 한다.
FROM node:24-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9 AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
# 공개 값만 전달한다. 서버 주소와 세션 키는 실행 환경에서 주입한다.
ARG NEXT_PUBLIC_ENROLLMENT_API_URL
RUN test -n "$NEXT_PUBLIC_ENROLLMENT_API_URL" && npm run build

FROM node:24-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9 AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
