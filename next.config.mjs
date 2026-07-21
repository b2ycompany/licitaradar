/** @type {import('next').NextConfig} */
const nextConfig = {
  // Evita o aviso de múltiplos lockfiles no Windows
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
