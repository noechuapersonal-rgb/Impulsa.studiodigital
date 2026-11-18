import { lock } from "@/lib/adminLock";

export async function POST(req: Request) {
  await lock();
  return Response.redirect(new URL("/admin", req.url), 303);
}
