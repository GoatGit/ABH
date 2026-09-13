import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  distDir: process.env.WORKBENCH_E2E === '1' ? '.next-e2e' : '.next',
};

if (process.env.WORKBENCH_E2E !== '1') {
  nextConfig.output = 'standalone';
}

export default nextConfig;
