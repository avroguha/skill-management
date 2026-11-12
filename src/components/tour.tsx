"use client";
// The guided tour: a few steps per persona (team member, manager, executive, administrator),
// each pointing at the real button on the real page. The page stays usable underneath: the
// highlighted button can be clicked. Next/Back, arrow keys, Esc to stop. Offered once per
// person on this browser; restarted from Help, or by startTour() from anywhere.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { Compass, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";

export type Persona = "employee" | "manager" | "executive" | "admin";
interface Step { path?: string; target?: string; title: string; body: string }

const EVENT = "skm:tour";
export function startTour() { window.dispatchEvent(new Event(EVENT)); }

function stepsFor(o: { persona: Persona; profileHref: string | null; rates: boolean; hasTeam: boolean; validates: boolean; canSeeOrg: boolean }): Step[] {
  const s: Step[] = [{
    title: "A quick tour",
    body: "A minute or two, showing the buttons you will use. The page stays live: you can click what is highlighted. Next and Back (or the arrow keys) move along; Esc stops.",
  }];
  if (o.profileHref) s.push({ path: o.profileHref, target: "nav-profile", title: "My profile", body: "Your skills against what your role and grade need, the next grade's gap, and any training booked for you." });
  if (o.rates) {
    s.push({ path: "/assess", target: "assess-form", title: "Self-assessment", body: "Choose a level from 0 to 5 for each skill your role needs; the wording of each level is right there. Add skills you hold beyond the list, and mark the ones you want to grow." });
    s.push({ path: "/assess", target: "assess-submit", title: "Submit for validation", body: "When you are done, submit: your manager agrees with each rating, adjusts it, or sends it back with a question. Save draft keeps your work without sending it." });
  }
  if (o.hasTeam) {
    s.push({ path: "/team", target: "kpis", title: "My team", body: "Everyone who reports to you: how far their self-assessments have got, what waits for you, where the team is short." });
    s.push({ path: "/team", target: "team-tabs", title: "People, skills needed, gaps, training", body: "Skills needed is where you say what your team must have, at what level and how many people. Gaps and Training follow from it." });
  }
  if (o.validates) s.push({ path: "/validate", target: "validate-queue", title: "Validate", body: "Ratings waiting for you. Agree, change the level (with a note), or send one back with a question. Validated levels are the official ones." });
  if (o.canSeeOrg) {
    s.push({ path: "/", target: "filters", title: "Overview at any level", body: "Pick a unit to look at that part of the organisation. The heatmap below shows each team's capability against what it needs." });
    s.push({ path: "/talent", target: "kpis", title: "Talent", body: "What talent this level has and what it lacks: strengths, missing skills, depth by area, and people with skills beyond their role." });
    s.push({ path: "/org", target: "org-chart", title: "Org chart", body: "Expand a card to see the people below; select it for their details and where the skills under them are thin." });
  }
  if (o.persona === "admin") {
    s.push({ path: "/admin", target: "admin-nav", title: "Admin", body: "The organisation, skills catalogue, roles and targets, users and sign-in, the ServiceNow sync, backups, help content and feedback. Open a person and use View as to see exactly what they see." });
    s.push({ path: "/admin/integrations", target: "integrations-new", title: "Integrations", body: "Give Power BI, Tableau or Excel a key to read the data. Each key is limited to the datasets you choose and can be revoked at any time." });
  }
  s.push({ target: "nav-help", title: "Help", body: "Answers to common questions, who to contact, and a form to tell us what is wrong or missing. The tour can be started again from there." });
  return s;
}

type Rect = { top: number; left: number; width: number; height: number };
const PAD = 6;
const GAP = 12;

export function Tour(props: { userKey: string; persona: Persona; profileHref: string | null; rates: boolean; hasTeam: boolean; validates: boolean; canSeeOrg: boolean }) {
  const { userKey, persona, profileHref, rates, hasTeam, validates, canSeeOrg } = props;
  const steps = useMemo(() => stepsFor({ persona, profileHref, rates, hasTeam, validates, canSeeOrg }), [persona, profileHref, rates, hasTeam, validates, canSeeOrg]);
  const [index, setIndex] = useState<number | null>(null);
  const [offer, setOffer] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const [card, setCard] = useState<{ top: number; left: number; width?: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<Element | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const { isMobile } = useSidebar();
  const seenKey = `skm-tour-seen:${userKey}`;

  const finish = useCallback(() => {
    setIndex(null); setRect(null); targetRef.current = null;
    try { localStorage.setItem(seenKey, new Date().toISOString()); } catch { /* private window */ }
  }, [seenKey]);

  // started from anywhere; offered once to someone who has not seen it
  useEffect(() => {
    const go = () => { setOffer(false); setIndex(0); };
    window.addEventListener(EVENT, go);
    let seen = true;
    try { seen = !!localStorage.getItem(seenKey); } catch { /* storage blocked: do not nag */ }
    const t = seen ? undefined : setTimeout(() => setOffer(true), 1200);
    return () => { window.removeEventListener(EVENT, go); if (t) clearTimeout(t); };
  }, [seenKey]);

  const step = index == null ? null : steps[index];

  // go to the step's page, then wait for its button to be on screen
  useEffect(() => {
    if (!step) return;
    setRect(null); targetRef.current = null;
    if (step.path && pathname !== step.path) { router.push(step.path); return; }
    if (!step.target) return;
    // on a phone the menu is folded away: point at the button that opens it
    const selector = step.target.startsWith("nav-") && isMobile ? '[data-tour="menu"]' : `[data-tour="${step.target}"]`;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      const el = document.querySelector(selector);
      const r = el?.getBoundingClientRect();
      if (el && r && r.width > 0 && r.height > 0) {
        clearInterval(timer);
        targetRef.current = el;
        el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
        setTimeout(() => { const b = el.getBoundingClientRect(); setRect({ top: b.top, left: b.left, width: b.width, height: b.height }); }, 350);
      } else if (tries > 40) clearInterval(timer); // not on this screen: the card shows on its own
    }, 100);
    return () => clearInterval(timer);
  }, [step, pathname, router, isMobile]);

  // follow the button as the page scrolls or resizes
  useEffect(() => {
    if (!step) return;
    let raf = 0;
    const track = () => {
      const el = targetRef.current;
      if (el) {
        const b = el.getBoundingClientRect();
        setRect((r) => (r && r.top === b.top && r.left === b.left && r.width === b.width && r.height === b.height ? r : { top: b.top, left: b.left, width: b.width, height: b.height }));
      }
      raf = requestAnimationFrame(track);
    };
    raf = requestAnimationFrame(track);
    return () => cancelAnimationFrame(raf);
  }, [step]);

  // the card: below the button if it fits, else above, else beside; always inside the window
  useLayoutEffect(() => {
    if (!step) return;
    const c = cardRef.current;
    const w = Math.min(336, window.innerWidth - 24), h = c?.offsetHeight ?? 200; // 21rem: the card at its natural width
    const vw = window.innerWidth, vh = window.innerHeight;
    const clampX = (x: number) => Math.max(12, Math.min(vw - w - 12, x));
    const clampY = (y: number) => Math.max(12, Math.min(vh - h - 12, y));
    if (!rect) { setCard({ top: clampY((vh - h) / 2), left: clampX((vw - w) / 2) }); return; }
    const below = rect.top + rect.height + PAD + GAP;
    const above = rect.top - PAD - GAP - h;
    if (below + h <= vh - 12) setCard({ top: below, left: clampX(rect.left + rect.width / 2 - w / 2) });
    else if (above >= 12) setCard({ top: above, left: clampX(rect.left + rect.width / 2 - w / 2) });
    else {
      // a tall target: beside it, on the roomier side, narrowing the card to fit if need be
      const right = vw - (rect.left + rect.width + PAD + GAP) - 12;
      const left = rect.left - PAD - GAP - 12;
      const room = Math.max(right, left);
      const width = Math.min(w, room);
      const top = clampY(Math.max(rect.top, 12) + 24);
      if (room >= 240) setCard({ top, left: right >= left ? rect.left + rect.width + PAD + GAP : rect.left - PAD - GAP - width, width });
      else setCard({ top: vh - h - 12, left: clampX((vw - w) / 2) }); // no room anywhere: along the bottom
    }
  }, [rect, step, index]);

  // keys, and focus on the card so a screen reader reads it
  useEffect(() => {
    if (index == null) return;
    cardRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight") { if (index + 1 < steps.length) setIndex(index + 1); else finish(); }
      else if (e.key === "ArrowLeft" && index > 0) setIndex(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, steps.length, finish]);

  if (typeof document === "undefined") return null;

  if (offer && index == null) {
    return createPortal(
      <div role="dialog" aria-label="Take the tour" className="fixed right-4 bottom-4 z-[60] w-[min(22rem,calc(100vw-2rem))] rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg">
        <div className="flex items-start gap-3">
          <Compass className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="grid gap-1">
            <div className="text-sm font-medium">New here?</div>
            <p className="text-xs text-muted-foreground">A short tour shows the buttons you will use, on the real pages.</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => { setOffer(false); setIndex(0); }}>Take the tour</Button>
              <Button size="sm" variant="ghost" onClick={() => { setOffer(false); finish(); }}>Not now</Button>
            </div>
          </div>
        </div>
      </div>, document.body);
  }
  if (!step) return null;

  const last = index === steps.length - 1;
  return createPortal(
    <>
      {/* the spotlight: everything else dimmed; clicks pass through to the page */}
      {rect ? (
        <div aria-hidden className="pointer-events-none fixed z-[60] rounded-md ring-2 ring-primary transition-all duration-200"
          style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2, boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.45)" }} />
      ) : <div aria-hidden className="pointer-events-none fixed inset-0 z-[60] bg-black/45" />}
      <div ref={cardRef} tabIndex={-1} role="dialog" aria-modal="false" aria-labelledby="tour-title" aria-describedby="tour-body"
        className="fixed z-[61] w-[min(21rem,calc(100vw-1.5rem))] rounded-lg border bg-popover p-4 text-popover-foreground shadow-xl outline-none"
        style={{ top: card?.top ?? -9999, left: card?.left ?? -9999, ...(card?.width ? { width: card.width } : {}) }}>
        <div className="flex items-start justify-between gap-3">
          <h2 id="tour-title" className="text-sm font-semibold">{step.title}</h2>
          <button type="button" onClick={finish} className="rounded p-0.5 text-muted-foreground hover:bg-accent" aria-label="Stop the tour"><X className="size-4" /></button>
        </div>
        <p id="tour-body" className="mt-1.5 text-sm text-muted-foreground">{step.body}</p>
        {isMobile && step.target?.startsWith("nav-") && <p className="mt-1.5 text-xs text-muted-foreground">On a phone it is in the menu: the button at the top left.</p>}
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground tabular">{index! + 1} of {steps.length}</span>
          <div className="flex gap-2">
            {index! > 0 && <Button size="sm" variant="ghost" onClick={() => setIndex(index! - 1)}>Back</Button>}
            <Button size="sm" onClick={() => (last ? finish() : setIndex(index! + 1))}>{last ? "Done" : "Next"}</Button>
          </div>
        </div>
      </div>
    </>, document.body);
}
