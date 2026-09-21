import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import {
  ClerkProvider,
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EduBot",
  description:
    "Turn your course PDFs into source-grounded summaries and adaptive quizzes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">
          <header className="flex items-center justify-between border-b border-black/10 px-6 py-3 dark:border-white/15">
            <Link href="/" className="font-semibold">
              EduBot
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Show when="signed-out">
                <SignInButton>
                  <button className="cursor-pointer hover:underline">
                    Sign in
                  </button>
                </SignInButton>
                <SignUpButton>
                  <button className="cursor-pointer rounded-full bg-foreground px-4 py-1.5 text-background">
                    Sign up
                  </button>
                </SignUpButton>
              </Show>
              <Show when="signed-in">
                <Link href="/dashboard" className="hover:underline">
                  Dashboard
                </Link>
                <UserButton />
              </Show>
            </nav>
          </header>
          <main className="flex flex-1 flex-col">{children}</main>
          <footer className="border-t border-black/10 px-6 py-3 text-xs text-black/60 dark:border-white/15 dark:text-white/60">
            AI-generated content is a formative study aid, not a replacement for
            your course materials. Always verify against the source.
          </footer>
        </body>
      </html>
    </ClerkProvider>
  );
}
