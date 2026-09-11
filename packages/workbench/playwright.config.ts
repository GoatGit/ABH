import {defineConfig} from '@playwright/test';
import process from 'node:process';

const apiPort=18777,appPort=18778;
process.env.ABH_API_URL=`http://127.0.0.1:${apiPort}`;
process.env.WORKBENCH_SETTINGS_URL=`http://127.0.0.1:${apiPort}/v1/testing/settings`;
process.env.WORKBENCH_COMPENSATION_URL=`http://127.0.0.1:${apiPort}/v1/testing/compensation`;
process.env.WEB_SSE_ENABLED='true';
process.env.WEB_QUERY_STALE_SECONDS='1';

export default defineConfig({
  testDir:'tests',
  timeout:45_000,
  workers:1,
  forbidOnly:!!process.env.CI,
  reporter:[['list']],
  use:{baseURL:`http://127.0.0.1:${appPort}`,trace:'on-first-retry'},
  webServer:[
    {
      command:'node test/browser/fake-abh-api.mjs',
      url:`http://127.0.0.1:${apiPort}/v1/queries/abh.missions.list`,
      reuseExistingServer:false,timeout:10_000,
    },
    {
      command:`pnpm exec next start -p ${appPort}`,
      url:`http://127.0.0.1:${appPort}/`,
      reuseExistingServer:false,timeout:30_000,
    },
  ],
});
