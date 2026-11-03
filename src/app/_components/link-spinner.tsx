"use client";

import { useLinkStatus } from "next/link";

/** Put inside a <Link>: shows a spinner while that link's page is loading. */
export function LinkSpinner() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <>
      <span
        aria-hidden
        className="ml-2 inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]"
      />
      <span role="status" className="sr-only">
        Loading
      </span>
    </>
  );
}
