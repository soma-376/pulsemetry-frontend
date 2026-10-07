import { z } from "zod";
import { retryAfterMs } from "./overview";

const receiptSchema = z.object({
  inquiryId: z.string().min(1),
  status: z.string(),
  receivedAt: z.iso.datetime({ offset: true }),
});
export type InquiryReceipt = z.infer<typeof receiptSchema>;
const errorSchema = z.object({ error: z.string(), message: z.string() });

/** `retryAfterSeconds`는 요청 한도에 걸렸을 때 서버가 알려 준 대기 시간이다. */
export class InquiryError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string,
    public retryAfterSeconds: number | null = null,
  ) {
    super(message);
  }
}

const UNAVAILABLE = "문의를 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.";

/**
 * 도입 문의를 접수한다. 로그인 전의 공개 경로라 세션을 붙이지 않는다.
 * 같은 회사·이메일을 다시 보내면 서버가 앞선 접수를 그대로 돌려준다 — 받은 접수 번호를 그대로 쓴다.
 */
export async function submitInquiry(
  input: { company: string; email: string },
  signal?: AbortSignal,
): Promise<InquiryReceipt> {
  const base = (
    process.env.NEXT_PUBLIC_ENROLLMENT_API_URL ?? "http://localhost:8080"
  ).replace(/\/$/, "");
  let response: Response;
  try {
    response = await fetch(`${base}/v1/inquiries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company: input.company, email: input.email }),
      credentials: "omit",
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new InquiryError(
      "network",
      0,
      "서버에 연결하지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.",
    );
  }
  const body: unknown = await response.json().catch(() => null);
  if (response.ok) {
    const receipt = receiptSchema.safeParse(body);
    if (!receipt.success)
      throw new InquiryError(
        "invalid_response",
        response.status,
        "접수 결과를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    return receipt.data;
  }
  const failure = errorSchema.safeParse(body);
  const code = failure.success ? failure.data.error : "unavailable";
  if (response.status === 429) {
    const seconds = Math.ceil(
      retryAfterMs(response.headers.get("Retry-After")) / 1000,
    );
    throw new InquiryError(
      code,
      429,
      seconds > 0
        ? `문의 요청이 너무 많습니다. ${seconds}초 뒤에 다시 시도해 주세요.`
        : "문의 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      seconds > 0 ? seconds : null,
    );
  }
  // 입력 오류의 문장은 서버가 폼 사용자에게 보이도록 쓴 것이다.
  if (response.status === 400)
    throw new InquiryError(
      code,
      400,
      failure.success ? failure.data.message : "입력한 내용을 확인해 주세요.",
    );
  if (response.status === 404)
    throw new InquiryError(code, 404, "지금은 온라인 문의를 받지 않습니다.");
  throw new InquiryError(code, response.status, UNAVAILABLE);
}
