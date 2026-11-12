"use client";
// A person's photo (from the photo URL template), falling back to initials when there is
// no template, no value for its placeholder, or the image does not load.
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export function PersonAvatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  return (
    <Avatar className={cn("size-8", className)}>
      {src && <AvatarImage src={src} alt="" className="object-cover" />}
      <AvatarFallback className="text-[11px] font-medium">{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
