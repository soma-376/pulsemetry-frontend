/** 조직의 조회 캐시를 한 번에 무효화할 수 있도록 공통 접두사를 사용한다. */
export const organizationKey = (organizationId: string) => ["organization", organizationId] as const;
