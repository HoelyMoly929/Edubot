import type { Metadata } from "next";
import Link from "next/link";
import { Fraunces, Geist_Mono, Source_Serif_4 } from "next/font/google";
import {
  ClerkProvider,
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import "./globals.css";

// Display face: the "wonk" and soft axes give Fraunces its character, used only
// for headings so it stays an accent rather than a texture.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
});

// Reading face. Study notes and question stems are read closely, so the body
// face is a text serif rather than a UI sans.
const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
});

// The margin rail's voice: page numbers, difficulty, scores.
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "EduBot",
  description:
    "Turn your course PDFs into cited study notes and quizzes that adapt as you answer.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${fraunces.variable} ${sourceSerif.variable} ${geistMono.variable} h-full antialiased`}
      >
        <body className="flex min-h-full flex-col">
          <header className="border-b border-rule">
            <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
              <Link href="/" className="display text-xl font-semibold">
                EduBot
              </Link>
              <nav className="flex items-center gap-5 text-sm">
                <Show when="signed-in">
                  <Link href="/dashboard" className="hover:text-source">
                    Documents
                  </Link>
                  <Link href="/history" className="hover:text-source">
                    History
                  </Link>
                  <UserButton />
                </Show>
                <Show when="signed-out">
                  <SignInButton>
                    <button className="cursor-pointer hover:text-source">Sign in</button>
                  </SignInButton>
                  <SignUpButton>
                    <button className="cursor-pointer rounded-full bg-ink px-4 py-1.5 text-paper">
                      Sign up
                    </button>
                  </SignUpButton>
                </Show>
              </nav>
            </div>
          </header>

          <main className="flex flex-1 flex-col">{children}</main>

          <footer className="border-t border-rule">
            <p className="mx-auto w-full max-w-5xl px-6 py-4 text-xs text-muted">
              Every note and question here is generated from your own upload and
              linked to the page it came from. It&rsquo;s a study aid, not a
              replacement for your course materials — check the source before you
              rely on it.
            </p>
          </footer>
        </body>
      </html>
    </ClerkProvider>
  );
}
