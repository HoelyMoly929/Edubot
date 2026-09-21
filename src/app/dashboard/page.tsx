import { auth, currentUser } from "@clerk/nextjs/server";

export default async function DashboardPage() {
  await auth.protect();
  const user = await currentUser();

  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">
        Welcome{user?.firstName ? `, ${user.firstName}` : ""}
      </h1>
      <p className="mt-2 text-sm text-black/60 dark:text-white/60">
        Signed in as {user?.primaryEmailAddress?.emailAddress}
      </p>
      <p className="mt-6 text-sm">
        Upload a PDF to generate a study summary and an adaptive quiz. (Coming
        next.)
      </p>
    </div>
  );
}
