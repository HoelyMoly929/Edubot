import Link from "next/link";
import { Show, SignUpButton } from "@clerk/nextjs";

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 p-6">
      <h1 className="text-4xl font-semibold tracking-tight">
        Study from your own material.
      </h1>
      <p className="text-black/70 dark:text-white/70">
        Upload a lecture PDF and EduBot turns it into a source-grounded summary
        and an adaptive quiz that adjusts to how you answer — every point and
        every question traceable back to the page it came from.
      </p>
      <div>
        <Show when="signed-out">
          <SignUpButton>
            <button className="cursor-pointer rounded-full bg-foreground px-5 py-2.5 text-sm text-background">
              Get started
            </button>
          </SignUpButton>
        </Show>
        <Show when="signed-in">
          <Link
            href="/dashboard"
            className="inline-block rounded-full bg-foreground px-5 py-2.5 text-sm text-background"
          >
            Go to dashboard
          </Link>
        </Show>
      </div>
    </div>
  );
}
