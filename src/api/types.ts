import type { components, paths } from './schema';
export type QueryRequest = components['schemas']['QueryRequest'];
export type QueryResponse = components['schemas']['QueryResponse'];
export type Frame = components['schemas']['Frame'];
export type Field = components['schemas']['Field'];
export type QueryResult = components['schemas']['QueryResult'];
export type Profile = paths['/me']['get']['responses'][200]['content']['application/json'];
export type FilterOptions =
  paths['/meta/filters']['get']['responses'][200]['content']['application/json'];
export type LoginResponse =
  paths['/auth/login']['post']['responses'][200]['content']['application/json'];
