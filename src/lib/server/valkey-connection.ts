import { createCluster, type RedisClientOptions } from "redis";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { SignatureV4 } from "@smithy/signature-v4";
import { HttpRequest } from "@smithy/protocol-http";
import { Sha256 } from "@aws-crypto/sha256-js";
import type { SessionCommands } from "./valkey-session-store";

// 비교 대상은 전체 직렬화 값이다. 값 배열·경로의 순서를 임의로 바꾸지 않는다.
export const compareSessionScript = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
if ARGV[2] == '' then redis.call('DEL', KEYS[1])
else redis.call('SET', KEYS[1], ARGV[2], 'PXAT', ARGV[3]) end
return 1`;
export const takeSessionScript = `
local value = redis.call('GET', KEYS[1])
if value then redis.call('DEL', KEYS[1]) end
return value`;

export async function iamToken(
  cacheName: string,
  username: string,
  region: string,
  credentials = fromNodeProviderChain(),
) {
  const signer = new SignatureV4({
    service: "elasticache",
    region,
    credentials,
    sha256: Sha256,
  });
  const signed = await signer.presign(
    new HttpRequest({
      protocol: "http:",
      hostname: cacheName,
      method: "GET",
      path: "/",
      headers: { host: cacheName },
      query: {
        Action: "connect",
        User: username,
        ResourceType: "ServerlessCache",
      },
    }),
    { expiresIn: 900 },
  );
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(signed.query ?? {})) {
    for (const entry of Array.isArray(value) ? value : [value]) {
      if (entry !== null) query.append(name, entry);
    }
  }
  return `${cacheName}/?${query.toString()}`;
}

export function createValkeyCommands(config: {
  host: string;
  cacheName: string;
  username: string;
  region: string;
}): SessionCommands {
  if (!/^[a-z0-9.-]+\.cache\.amazonaws\.com$/.test(config.host))
    throw new Error("Valkey TLS endpoint가 필요합니다.");
  if (
    !/^[a-z][a-z0-9-]+$/.test(config.cacheName) ||
    !/^[a-z][a-z0-9-]+$/.test(config.username)
  )
    throw new Error("Valkey IAM 설정을 확인하세요.");
  const credentials = fromNodeProviderChain();
  let cluster: ReturnType<typeof newCluster> | undefined;
  let connecting: Promise<void> | undefined;
  function newCluster() {
    const provider: NonNullable<RedisClientOptions["credentialsProvider"]> = {
      type: "streaming-credentials-provider",
      async subscribe(listener) {
        const get = async () => ({
          username: config.username,
          password: await iamToken(
            config.cacheName,
            config.username,
            config.region,
            credentials,
          ),
        });
        const initial = await get();
        let disposed = false;
        const timer = setInterval(
          () => {
            void get().then(
              (value) => {
                if (!disposed) listener.onNext(value);
              },
              () => {
                if (!disposed)
                  listener.onError(new Error("Valkey 인증 갱신 실패"));
              },
            );
          },
          10 * 60 * 1000,
        );
        timer.unref();
        return [
          initial,
          {
            dispose() {
              disposed = true;
              clearInterval(timer);
            },
          },
        ];
      },
      onReAuthenticationError() {
        if (client.isOpen) client.destroy();
      },
    };
    const client = createCluster({
      rootNodes: [{ url: `rediss://${config.host}:6379` }],
      useReplicas: false,
      commandOptions: { timeout: 2000 },
      defaults: {
        credentialsProvider: provider,
        socket: {
          tls: true,
          connectTimeout: 2000,
          reconnectStrategy: (retries) => (retries < 2 ? 100 : false),
        },
        disableOfflineQueue: true,
        commandsQueueMaxLength: 500,
      },
    });
    // 에러 객체에는 연결 정보가 포함될 수 있다. HTTP 경계에서 정제한 503만 기록한다.
    client.on("error", () => undefined);
    return client;
  }
  async function ready() {
    if (!cluster || (!cluster.isOpen && !connecting)) {
      cluster = newCluster();
      const client = cluster;
      connecting = (async () => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            client.connect(),
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () => reject(new Error("Valkey 연결 시간 초과")),
                5000,
              );
            }),
          ]);
        } catch {
          if (client.isOpen) client.destroy();
          throw new Error("Valkey 연결 실패");
        } finally {
          clearTimeout(timer);
          connecting = undefined;
        }
      })();
    }
    await connecting;
    if (!cluster) throw new Error("Valkey 연결 실패");
    return cluster;
  }
  return {
    async get(key) {
      return (await ready()).get(key);
    },
    async create(key, value, expiresAt) {
      return (
        (await (
          await ready()
        ).set(key, value, {
          NX: true,
          expiration: { type: "PXAT", value: expiresAt },
        })) === "OK"
      );
    },
    async compareAndSet(key, expected, value, expiresAt) {
      return (
        (await (
          await ready()
        ).eval(compareSessionScript, {
          keys: [key],
          arguments: [expected, value ?? "", String(expiresAt)],
        })) === 1
      );
    },
    async take(key) {
      const value = await (
        await ready()
      ).eval(takeSessionScript, { keys: [key], arguments: [] });
      return typeof value === "string" ? value : null;
    },
  };
}
