"use client";

import { useState } from "react";
import { DEMO_ACCOUNTS } from "@/lib/constants";
import { request } from "@/lib/browser";
import { Mark, Wordmark } from "@/components/mark";
import { Button } from "@/components/ui/button";

export function Phone({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto min-h-dvh w-full max-w-[440px] bg-paper pb-[env(safe-area-inset-bottom)] shadow-[0_0_0_1px_#e4e7ec] max-sm:shadow-none">{children}</div>;
}

export function AppHeader({ title, subtitle }: { title?: string; subtitle?: string }) {
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);

  async function signIn(email: string, password: string) {
    setMessage("");
    const { response, data } = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      setMessage("That demo sign-in did not work.");
      return;
    }
    const role = (data.user as { role?: string } | undefined)?.role;
    const path = role === "operator" ? "/operator" : role === "admin" ? "/admin" : "/";
    window.location.assign(path);
  }

  const detail = [title, subtitle].filter((part) => part && part !== "Dropin").join(" · ");

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/95 px-4 py-2.5 backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <a className="flex min-w-0 items-center gap-2" href="/">
          <Mark />
          <Wordmark detail={detail} />
        </a>
        <div className="relative shrink-0">
          <button className="min-h-11 rounded-full border border-line px-3 text-sm font-semibold" onClick={() => setOpen((value) => !value)} type="button">
            Switch
          </button>
          {open ? (
            <div className="absolute right-0 z-40 mt-2 w-56 rounded-2xl border border-line bg-paper p-2 text-left shadow-lg">
              {DEMO_ACCOUNTS.map((account) => (
                <button key={account.email} className="block w-full rounded-xl px-3 py-3 text-left text-sm hover:bg-canvas" onClick={() => signIn(account.email, account.password)} type="button">
                  <span className="block font-semibold">{account.name}</span>
                  <span className="text-slate">{account.role}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {message ? <p className="mt-2 text-sm text-alert">{message}</p> : null}
    </header>
  );
}

export function SessionPicker() {
  const [message, setMessage] = useState("");

  async function signIn(email: string, password: string) {
    const { response, data } = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      setMessage("Sign-in failed. Restart the app if the database is still starting.");
      return;
    }
    const role = (data.user as { role?: string } | undefined)?.role;
    const path = role === "operator" ? "/operator" : role === "admin" ? "/admin" : "/";
    window.location.assign(path);
  }

  return (
    <div className="grid gap-3">
      {DEMO_ACCOUNTS.slice(0, 3).map((account) => (
        <Button key={account.email} size="lg" variant={account.role === "Passenger" ? "primary" : "secondary"} onClick={() => signIn(account.email, account.password)}>
          Continue as {account.name}
        </Button>
      ))}
      <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
        {DEMO_ACCOUNTS.slice(3).map((account) => (
          <Button key={account.email} variant="secondary" onClick={() => signIn(account.email, account.password)}>
            {account.name.split(" ")[0]}
          </Button>
        ))}
      </div>
      {message ? <p className="text-sm text-alert">{message}</p> : null}
    </div>
  );
}
