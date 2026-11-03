import type { Metadata } from "next";
import { Fredoka, Nunito } from "next/font/google";
import {
  ClerkProvider,
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import { LogoLink } from "./_components/logo-link";
import { NavLinks } from "./_components/nav-links";
import "./globals.css";

const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
  weight: ["500", "600"],
});

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: "EduBot",
  description:
    "Turn your course PDFs into cited study notes and quizzes that adapt as you answer.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${fredoka.variable} ${nunito.variable} h-full antialiased`}>
        <body className="flex min-h-full flex-col">
          <header className="flex flex-wrap items-center justify-between gap-4 px-[clamp(16px,4vw,48px)] py-5">
            <LogoLink />

            <nav className="flex flex-wrap items-center gap-2">
              <Show when="signed-in">
                <NavLinks />
                <span className="ml-2 flex items-center">
                  <UserButton />
                </span>
              </Show>
              <Show when="signed-out">
                <SignInButton>
                  <button className="min-h-11 cursor-pointer rounded-full px-5 font-bold text-[#3A4068] hover:bg-brand-soft">
                    Sign in
                  </button>
                </SignInButton>
                <SignUpButton>
                  <button className="min-h-11 cursor-pointer rounded-full bg-brand px-5 font-bold text-white hover:bg-brand-hover">
                    Sign up
                  </button>
                </SignUpButton>
              </Show>
            </nav>
          </header>

          <main className="flex flex-1 flex-col">{children}</main>

          <footer className="px-[clamp(16px,4vw,48px)] pt-6 pb-8">
            <p className="mx-auto max-w-[1184px] text-sm text-muted">
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
