import { useEffect, useRef, useState } from "react";
import { User } from "lucide-react";
import { useAuth } from "@/lib/tokentrack/auth";

export function AccountMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Account"
        className="grid size-8 place-items-center rounded-md border border-border bg-panel text-muted-foreground hover:text-foreground"
      >
        <User className="size-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-56 rounded-md border border-border bg-panel p-2 shadow-lg">
          <p className="truncate px-2 py-1.5 text-xs text-muted-foreground">
            Signed in as
            <br />
            <span className="font-medium text-foreground">{user?.email}</span>
          </p>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
            className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-xs font-medium text-foreground hover:bg-secondary"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
