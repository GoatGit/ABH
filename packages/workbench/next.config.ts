import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
};

if (process.env.WORKBENCH_E2E !== '1') {
  nextConfig.output = 'standalone';
}

export default nextConfig;
