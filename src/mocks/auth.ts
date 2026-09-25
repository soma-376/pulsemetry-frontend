/** 사전 등록된 조직·인증 연결·관리자. 실제 인증 요청에는 사용하지 않는 프론트 데모입니다. */
export const AUTH_SEED = {
  organizationId: "org-codeworks",
  organizationName: "코드웍스",
  domains: ["codeworks.io"],
  connection: {
    provider: "Okta",
    issuer: "https://codeworks.example.okta.com",
    clientId: "demo-pulsemetry",
  },
  admins: [{ email: "admin@codeworks.io", name: "코드웍스 관리자" }],
};
