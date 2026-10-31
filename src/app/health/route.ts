// ALB가 /api/health로 전환될 때까지 유지하는 호환 경로다.
export { GET } from "../api/health/route";

export const dynamic = "force-dynamic";
