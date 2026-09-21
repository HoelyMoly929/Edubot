import { clerkMiddleware } from "@clerk/nextjs/server";

// Populates the Clerk auth context so auth() works in pages, route handlers and
// server functions. Deliberately does NOT gate routes here: path matching can
// drift from how Next.js actually routes, so each page/route guards its own data
// (see spec §9 — isolation enforced at the query level).
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
