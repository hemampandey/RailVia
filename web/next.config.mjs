/** @type {import('next').NextConfig} */
const API = process.env.API_ORIGIN ?? "http://127.0.0.1:8077";

const nextConfig = {
  // Proxy /api to the FastAPI service. The optimiser is Python — OR-Tools and
  // LightGBM have no Node equivalent — so Next.js is the view layer only, and
  // the browser talks to one origin.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API}/api/:path*` }];
  },
};

export default nextConfig;
