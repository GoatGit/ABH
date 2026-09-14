/** Development defaults to the local mock API (pnpm dev starts it); production builds
 *  must be given an explicit ABH_API_URL or every upstream call fails closed. */
const devApiUrl='http://127.0.0.1:18777';
export const workbenchConfig={
  apiUrl:process.env.ABH_API_URL
    ??(process.env.NODE_ENV==='production'?undefined:devApiUrl),
  defaultPageSize:Number(process.env.WEB_DEFAULT_PAGE_SIZE??25),
  queryStaleSeconds:Number(process.env.WEB_QUERY_STALE_SECONDS??5),
  sseEnabled:process.env.WEB_SSE_ENABLED!=='false',
} as const;
