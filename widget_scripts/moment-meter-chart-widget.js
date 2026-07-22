// ============================================================================
//  Moment Meter Chart — iOS Home Screen widget (for the free "Scriptable" app)
//  Today's time as a segmented donut + which activity is current.
//
//  ONE-TIME SETUP
//  1. Install "Scriptable" from the App Store (free).
//  2. Open Scriptable → + (new script) → paste this whole file.
//  3. Fill in GIST_ID and TOKEN below (Moment Meter → Settings shows the Gist ID;
//     TOKEN is the same GitHub token you connected sync with).
//  4. Name the script "Moment Meter Chart".
//  5. Home Screen → long-press → + → Scriptable → add a Small / Medium / Large
//     widget → long-press it → Edit Widget → Script: "Moment Meter Chart".
//
//  This is the CHART / overview widget. For a clean square widget that shows only
//  your CURRENT ACTIVITY with a big live timer, use "moment-meter-now-widget.js".
//
//  AUTO-REFRESH: Scriptable widgets update via iOS WidgetKit, not the classic
//  "Background App Refresh" list (so Scriptable not appearing there is normal).
//  iOS alone decides the cadence — usually every ~15-60 min, and never instantly.
//  The only user setting that affects it: turn Low Power Mode OFF (it suspends
//  all widget refreshes). For real-time, use the app's in-app live bar instead.
// ============================================================================

// ---- CONFIG: fill these in ----
const GIST_ID = "PASTE_YOUR_GIST_ID_HERE";
const TOKEN   = "PASTE_YOUR_ghp_TOKEN_HERE";
const APP_URL = "https://umartinezcode.github.io/moment-meter/";  // tapping the widget opens this
// --------------------------------

const SYNC_FILE = "momentmeter.json";
const DAY = 86400000, MIN = 60000;

// palette
const BG_TOP = "#191c24", BG_BOT = "#0c0d11";
const INK = "#f4f5f8", SUB = "#9aa1ae", FAINT = "#6b7280", TRACK = "#ffffff";

async function loadData(){
  // cache-buster query + no-cache headers so the widget always sees the latest Gist
  const req = new Request("https://api.github.com/gists/" + GIST_ID + "?t=" + Date.now());
  req.headers = { Authorization: "Bearer " + TOKEN, Accept: "application/vnd.github+json",
    "Cache-Control": "no-cache", "If-None-Match": "" };
  const gist = await req.loadJSON();
  const f = gist.files && gist.files[SYNC_FILE];
  if(!f) throw new Error("No " + SYNC_FILE + " in gist");
  let content = f.content;
  if(f.truncated){ content = await new Request(f.raw_url + "?t=" + Date.now()).loadString(); }
  return JSON.parse(content);
}

const startOfDay = ts => { const d = new Date(ts); d.setHours(0,0,0,0); return d.getTime(); };
const overlap = (s,e,a,b) => Math.max(0, Math.min(e,b) - Math.max(s,a));
function fmtDur(ms){ const m = Math.round(ms/MIN); if(m<60) return m+"m"; return Math.floor(m/60)+"h "+(m%60)+"m"; }
function fmtClock(ms){ const s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor(s%3600/60); return h+":"+String(m).padStart(2,"0"); }

function computeToday(S){
  const a = startOfDay(Date.now()), b = a + DAY, now = Date.now();
  const catById = {}; (S.categories||[]).forEach(c=>catById[c.id]=c);
  const map = {};
  for(const ev of (S.events||[])){ const o = overlap(ev.start, ev.end, a, b); if(o>0) map[ev.catId]=(map[ev.catId]||0)+o; }
  let active = null;
  for(const t of (S.timers||[])){
    const o = overlap(t.start, now, a, b); if(o>0) map[t.catId]=(map[t.catId]||0)+o;
    active = { cat: catById[t.catId], elapsed: now - t.start, start: t.start };
  }
  const rows = Object.entries(map).map(([id,ms])=>({cat:catById[id],ms})).filter(r=>r.cat).sort((x,y)=>y.ms-x.ms);
  const total = rows.reduce((s,r)=>s+r.ms,0);
  return { rows, total, active };
}

const col = (h,a) => { try{ return a==null ? new Color(h) : new Color(h,a); }catch(e){ return new Color("#8b8f98"); } };
function lighten(hex, amt){
  try{ const h=hex.replace("#",""); let r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);
    r=Math.round(r+(255-r)*amt); g=Math.round(g+(255-g)*amt); b=Math.round(b+(255-b)*amt);
    return "#"+[r,g,b].map(x=>x.toString(16).padStart(2,"0")).join(""); }catch(e){ return hex; }
}

// segmented donut with the total baked into the center hole
function donut(rows, total, size, centerBig, centerSmall){
  const ctx = new DrawContext();
  ctx.size = new Size(size, size); ctx.opaque = false; ctx.respectScreenScale = true;
  const cx=size/2, cy=size/2, R=size/2-3, thick=size*0.15, r=R-thick;
  // faint full track
  const ring=(rad,color)=>{ const p=new Path(); p.addEllipse(new Rect(cx-rad,cy-rad,rad*2,rad*2)); ctx.addPath(p); ctx.setFillColor(color); ctx.fillPath(); };
  ring(R, col(TRACK,0.07)); ring(r, col(BG_TOP,1));
  if(total){
    const gap = rows.length>1 ? 0.05 : 0;
    let ang=-Math.PI/2;
    for(const row of rows){
      const sweep=row.ms/total*Math.PI*2;
      const a0=ang+gap/2, a1=ang+sweep-gap/2;
      if(a1>a0){
        const steps=Math.max(2,Math.ceil((a1-a0)/0.18));
        const p=new Path();
        p.move(new Point(cx+Math.cos(a0)*R, cy+Math.sin(a0)*R));
        for(let i=1;i<=steps;i++){ const t=a0+(a1-a0)*(i/steps); p.addLine(new Point(cx+Math.cos(t)*R, cy+Math.sin(t)*R)); }
        for(let i=steps;i>=0;i--){ const t=a0+(a1-a0)*(i/steps); p.addLine(new Point(cx+Math.cos(t)*r, cy+Math.sin(t)*r)); }
        p.closeSubpath(); ctx.addPath(p); ctx.setFillColor(col(row.cat.color)); ctx.fillPath();
      }
      ang+=sweep;
    }
  }
  // center text
  if(centerBig){
    ctx.setTextAlignedCenter();
    ctx.setFont(Font.boldSystemFont(size*0.185)); ctx.setTextColor(col(INK));
    ctx.drawTextInRect(centerBig, new Rect(0, cy-size*0.16, size, size*0.22));
    if(centerSmall){ ctx.setFont(Font.mediumSystemFont(size*0.075)); ctx.setTextColor(col(SUB));
      ctx.drawTextInRect(centerSmall, new Rect(0, cy+size*0.055, size, size*0.12)); }
  }
  return ctx.getImage();
}

function bg(w){
  const g = new LinearGradient();
  g.colors = [col(BG_TOP), col(BG_BOT)]; g.locations = [0,1];
  g.startPoint = new Point(0,0); g.endPoint = new Point(0,1);
  w.backgroundGradient = g;
}
// name-only pill (no live clock) — for the medium overview widget
function activeName(stack, active){
  const c = active.cat ? active.cat.color : "#d4408f";
  const pill = stack.addStack();
  pill.backgroundColor = col(c,0.20); pill.cornerRadius = 9; pill.setPadding(5,10,5,10); pill.centerAlignContent();
  const dot = pill.addStack(); dot.size=new Size(7,7); dot.backgroundColor=col(lighten(c,0.15)); dot.cornerRadius=4;
  pill.addSpacer(6);
  const nm = pill.addText(active.cat?active.cat.name:"Tracking");
  nm.textColor = col(lighten(c,0.55)); nm.font = Font.semiboldSystemFont(12.5); nm.lineLimit = 1; nm.minimumScaleFactor = 0.7;
}
// horizontal pill with LIVE clock (large widget)
function activePill(stack, active){
  const c = active.cat ? active.cat.color : "#d4408f";
  const pill = stack.addStack();
  pill.backgroundColor = col(c,0.20); pill.cornerRadius = 9; pill.setPadding(5,9,5,9); pill.centerAlignContent();
  const dot = pill.addStack(); dot.size=new Size(7,7); dot.backgroundColor=col(lighten(c,0.15)); dot.cornerRadius=4;
  pill.addSpacer(6);
  const nm = pill.addText(active.cat?active.cat.name:"Tracking");
  nm.textColor = col(lighten(c,0.55)); nm.font = Font.semiboldSystemFont(12); nm.lineLimit = 1; nm.minimumScaleFactor = 0.7;
  pill.addSpacer(7);
  // LIVE timer: iOS ticks this on its own between refreshes — no re-running the script
  const d = pill.addDate(new Date(active.start));
  d.applyTimerStyle();
  d.textColor = col(lighten(c,0.55)); d.font = Font.semiboldSystemFont(12);
}
// stacked, centered active block for the narrow small widget (name over live timer)
function activeStacked(w, active){
  const c = active.cat ? active.cat.color : "#d4408f";
  const r1 = w.addStack(); r1.centerAlignContent();
  r1.addSpacer();
  const dot = r1.addStack(); dot.size=new Size(7,7); dot.backgroundColor=col(lighten(c,0.15)); dot.cornerRadius=4;
  r1.addSpacer(5);
  const nm = r1.addText(active.cat?active.cat.name:"Tracking");
  nm.textColor = col(lighten(c,0.5)); nm.font = Font.semiboldSystemFont(11); nm.lineLimit = 1; nm.minimumScaleFactor = 0.6;
  r1.addSpacer();
  w.addSpacer(2);
  const r2 = w.addStack(); r2.centerAlignContent();
  r2.addSpacer();
  const d = r2.addDate(new Date(active.start));   // short, own line → never cut off
  d.applyTimerStyle(); d.textColor = col(INK); d.font = Font.boldSystemFont(16);
  r2.addSpacer();
}
function legendRow(stack, r, total){
  const ln = stack.addStack(); ln.centerAlignContent();
  const dot = ln.addStack(); dot.size=new Size(9,9); dot.backgroundColor=col(r.cat.color); dot.cornerRadius=4.5;
  ln.addSpacer(7);
  const nm = ln.addText(r.cat.name); nm.textColor=col("#cdd0d7"); nm.font=Font.systemFont(12); nm.lineLimit=1;
  ln.addSpacer();
  const pc = ln.addText(Math.round(r.ms/total*100)+"%"); pc.textColor=col(FAINT); pc.font=Font.systemFont(11);
  ln.addSpacer(8);
  const v = ln.addText(fmtDur(r.ms)); v.textColor=col(SUB); v.font=Font.mediumSystemFont(12);
}

async function build(){
  const w = new ListWidget(); bg(w);
  // NOTE: no w.url set → tapping the widget RE-RUNS this script (a manual refresh
  // with the latest data). Set w.url = APP_URL instead if you'd rather it open the app.
  const family = config.widgetFamily || "medium";

  let data;
  try{ data = await loadData(); }
  catch(e){
    const t=w.addText("Moment Meter"); t.textColor=col(INK); t.font=Font.boldSystemFont(15);
    w.addSpacer(4);
    const err=w.addText("Add your Gist ID + token at the top of the script."); err.textColor=col("#e3574e"); err.font=Font.systemFont(11);
    return w;
  }
  const { rows, total, active } = computeToday(data);
  const hasData = total>0;

  w.setPadding(14,15,14,15);
  if(family==="small"){
    w.setPadding(10,10,10,10);
    // donut sized to leave room for the active lines below (avoids clipping the timer)
    const img=w.addImage(donut(rows, total, active?78:112, hasData?fmtDur(total):"0m", "today"));
    img.centerAlignImage();
    if(active){ w.addSpacer(6); activeStacked(w, active); w.addSpacer(2); }
    else { w.addSpacer(6); const l=w.addText("Not tracking"); l.textColor=col(FAINT); l.font=Font.systemFont(11); l.centerAlignText(); }

  } else if(family==="large"){
    const head=w.addStack(); head.centerAlignContent();
    const ht=head.addText("Today"); ht.textColor=col(INK); ht.font=Font.boldSystemFont(20);
    head.addSpacer();
    const hd=head.addText(new Date().toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"}));
    hd.textColor=col(SUB); hd.font=Font.systemFont(13);
    w.addSpacer(10);
    const mid=w.addStack(); mid.centerAlignContent();
    mid.addImage(donut(rows, total, 150, hasData?fmtDur(total):"0m", "tracked"));
    mid.addSpacer(16);
    const rt=mid.addStack(); rt.layoutVertically();
    if(active){ activePill(rt, active); rt.addSpacer(4); const sub=rt.addText("running now"); sub.textColor=col(FAINT); sub.font=Font.systemFont(10.5); }
    else { const idle=rt.addText("Not tracking"); idle.textColor=col(FAINT); idle.font=Font.systemFont(13); }
    rt.addSpacer(12);
    const cap=rt.addText((rows.length||0)+" categories"); cap.textColor=col(SUB); cap.font=Font.mediumSystemFont(11);
    w.addSpacer(12);
    for(const r of rows.slice(0,6)){ legendRow(w, r, total); w.addSpacer(6); }
    if(!rows.length){ const e=w.addText("Nothing tracked yet today."); e.textColor=col(FAINT); e.font=Font.systemFont(12); }

  } else { // medium
    const row=w.addStack(); row.centerAlignContent();
    row.addImage(donut(rows, total, 128, hasData?fmtDur(total):"0m", "today"));
    row.addSpacer(15);
    const right=row.addStack(); right.layoutVertically();
    if(active){ activeName(right, active); }   // current activity name only (no ticking clock)
    else { const idle=right.addText("Not tracking"); idle.textColor=col(FAINT); idle.font=Font.mediumSystemFont(13); }
    right.addSpacer(10);
    if(rows.length){ for(const r of rows.slice(0,3)){ legendRow(right, r, total); right.addSpacer(6); } }
    else { const e=right.addText("Start a timer to see\nyour day here."); e.textColor=col(FAINT); e.font=Font.systemFont(12); }
  }

  // ask iOS to refresh sooner when idle, so a newly-started timer is picked up faster
  // (iOS still decides the real cadence, but a lower hint helps when it has budget)
  w.refreshAfterDate = new Date(Date.now() + (active ? 30 : 120) * 1000);
  return w;
}

const widget = await build();
if(config.runsInWidget) Script.setWidget(widget);
else { const f=config.widgetFamily; f==="small"?await widget.presentSmall():f==="large"?await widget.presentLarge():await widget.presentMedium(); }
Script.complete();
