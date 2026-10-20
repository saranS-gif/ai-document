/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["pdfjs-dist"],
    outputFileTracingIncludes: {
      "/api/analyze": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"]
    }
  }
};
export default nextConfig;
