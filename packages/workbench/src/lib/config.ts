export const workbenchConfig={
  apiUrl:process.env.ABH_API_URL,
  defaultPageSize:Number(process.env.WEB_DEFAULT_PAGE_SIZE??25),
  queryStaleSeconds:Number(process.env.WEB_QUERY_STALE_SECONDS??5),
  sseEnabled:process.env.WEB_SSE_ENABLED!=='false',
} as const;
