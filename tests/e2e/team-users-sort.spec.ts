import { test, seedOrganizations } from "./fixtures";
import { seedPeriod, signIn } from "./helpers";
import { checkAverageDeviationSort } from "./team-users-sort-checks";

for (const pageSize of [12, 5]) {
  test(`TEAM-USERS-SORT-A @p1 @read 평균 대비 양방향 서버 정렬과 offset (조회 limit ${pageSize})`, async ({
    page,
  }) => {
    await signIn(page, "admin@seed-a.example.test");
    await checkAverageDeviationSort(page, {
      organizationId: seedOrganizations[0].id,
      ...seedPeriod(),
      pageSize,
    });
  });
}
