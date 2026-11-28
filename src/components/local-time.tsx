"use client";
// A date or time in the reader's own time zone. The server cannot know that zone, so the first
// render (on the server and in the browser alike) is in UTC; once the page is live the browser
// shows its own. Same first render on both sides: no hydration mismatch, no day off by one.
import { useEffect, useState } from "react";

export function LocalTime({ value, options, className }: {
  value: string | Date;
  options: Intl.DateTimeFormatOptions;
  className?: string;
}) {
  const iso = typeof value === "string" ? value : value.toISOString();
  const format = (timeZone?: string) => new Intl.DateTimeFormat("en-GB", { ...options, timeZone }).format(new Date(iso));
  const [text, setText] = useState(() => format("UTC"));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the options are literals at every call site
  useEffect(() => setText(format()), [iso]);
  return <time dateTime={iso} className={className}>{text}</time>;
}
