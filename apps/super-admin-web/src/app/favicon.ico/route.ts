// The control plane has no favicon asset. Avoid a browser-generated missing-resource error.
export function GET() {
  return new Response(null, { status: 204 });
}
