import Link from "next/link";
import { Show, SignUpButton } from "@clerk/nextjs";

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-20">
      <div className="grid gap-x-6 gap-y-10 sm:grid-cols-[6rem_1fr]">
        <p className="rail-label sm:pt-4">Study aid</p>

        <div>
          <h1 className="display max-w-3xl text-4xl leading-[1.1] font-semibold sm:text-6xl">
            Notes and quizzes from your own PDFs, with{" "}
            <span className="marker">the page they came from</span> attached.
          </h1>

          <p className="mt-8 max-w-xl text-lg leading-relaxed text-muted">
            Upload a lecture PDF. EduBot writes study notes and builds a quiz that
            gets harder or easier as you answer — and shows you the exact passage
            behind every note and every question, so you can check it rather than
            take its word.
          </p>

          <div className="mt-10">
            <Show when="signed-out">
              <SignUpButton>
                <button className="cursor-pointer rounded-full bg-ink px-6 py-3 text-paper">
                  Start with a PDF
                </button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <Link
                href="/dashboard"
                className="inline-block rounded-full bg-ink px-6 py-3 text-paper"
              >
                Go to your documents
              </Link>
            </Show>
          </div>
        </div>
      </div>

      {/* The three things it does, in the order you meet them. The rail numbers
          are a real sequence, not decoration. */}
      <ol className="mt-24 grid gap-x-6 gap-y-10 border-t border-rule pt-10 sm:grid-cols-3">
        {[
          {
            step: "01",
            title: "It reads your document",
            body: "Text is pulled out page by page and split into passages, so everything stays tied to where it appeared.",
          },
          {
            step: "02",
            title: "It writes from those passages only",
            body: "Notes and questions are built from retrieved passages, never from general knowledge about the topic.",
          },
          {
            step: "03",
            title: "It adapts while you answer",
            body: "Score above 85% and questions get harder. Below 70% and they get easier. In between, it holds.",
          },
        ].map(({ step, title, body }) => (
          <li key={step}>
            <div className="rail-label">{step}</div>
            <h2 className="mt-3 text-lg">{title}</h2>
            <p className="mt-2 text-muted">{body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
