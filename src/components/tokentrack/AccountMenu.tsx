import { useEffect, useRef, useState } from "react";
import { User } from "lucide-react";
import { useAuth } from "@/lib/tokentrack/auth";
import { useTokenTrack } from "@/lib/tokentrack/store";

export function AccountMenu() {
  const { user, signOut } = useAuth();
  const { avatarImageUrl, uploadAvatarImage } = useTokenTrack();
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const onPickAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again later
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      await uploadAvatarImage(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Account"
        className="grid size-8 place-items-center overflow-hidden rounded-md border border-border bg-panel text-muted-foreground hover:text-foreground"
      >
        {avatarImageUrl ? (
          <img src={avatarImageUrl} alt="" className="size-full object-cover" />
        ) : (
          <User className="size-4" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-56 rounded-md border border-border bg-panel p-2 shadow-lg">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={onPickAvatar}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium text-foreground hover:bg-secondary disabled:opacity-60"
          >
            {avatarImageUrl ? (
              <img
                src={avatarImageUrl}
                alt=""
                className="size-5 shrink-0 rounded-full object-cover"
              />
            ) : (
              <User className="size-4 shrink-0 text-muted-foreground" />
            )}
            {uploading ? "Uploading…" : "Change Avatar Photo"}
          </button>
          {error && <p className="px-2 pb-1 text-[10px] text-token">{error}</p>}

          <div className="my-1 border-t border-border" />

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
