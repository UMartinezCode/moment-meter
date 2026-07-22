// ============================================================================
//  Moment Meter — "Now" widget (for the free Scriptable app)
//  A clean square widget showing ONLY your current activity + a big live timer.
//  No donut, so nothing gets cramped or cut off. Pair it with the chart
//  widget ("Moment Meter Chart" / moment-meter-widget.js) if you want both.
//
//  AUTO-REFRESH: Scriptable widgets update via iOS WidgetKit on iOS's own
//  schedule (every ~15-60 min, never instant). The only setting that affects it
//  is Low Power Mode (turn it OFF — it suspends widget refreshes). The live timer
//  still ticks regardless; the current ACTIVITY only changes on an iOS refresh.
//
//  SETUP
//  1. Scriptable → + (new script) → paste this whole file → name it
//     "Moment Meter Now".
//  2. Fill in GIST_ID and TOKEN below (same values as your other Moment Meter
//     script — Settings shows the Gist ID; TOKEN is your GitHub token).
//  3. Home Screen → long-press → + → Scriptable → add a SMALL widget →
//     long-press it → Edit Widget → Script: "Moment Meter Now".
//
//  The timer ticks live on its own — iOS updates it without re-running the script.
// ============================================================================

// ---- CONFIG ----
const GIST_ID = "PASTE_YOUR_GIST_ID_HERE";
const TOKEN   = "PASTE_YOUR_ghp_TOKEN_HERE";
const APP_URL = "https://umartinezcode.github.io/moment-meter/";
// ----------------

const SYNC_FILE = "momentmeter.json";
const DAY = 86400000, MIN = 60000;
const INK = "#f4f5f8", SUB = "#9aa1ae", FAINT = "#7b818c";

async function loadData(){
  const req = new Request("https://api.github.com/gists/" + GIST_ID + "?t=" + Date.now());
  req.headers = { Authorization: "Bearer " + TOKEN, Accept: "application/vnd.github+json", "Cache-Control": "no-cache" };
  const gist = await req.loadJSON();
  const f = gist.files && gist.files[SYNC_FILE];
  if(!f) throw new Error("no file");
  let content = f.content;
  if(f.truncated){ content = await new Request(f.raw_url + "?t=" + Date.now()).loadString(); }
  return JSON.parse(content);
}

const startOfDay = ts => { const d=new Date(ts); d.setHours(0,0,0,0); return d.getTime(); };
const overlap = (s,e,a,b) => Math.max(0, Math.min(e,b)-Math.max(s,a));
function fmtDur(ms){ const m=Math.round(ms/MIN); if(m<60) return m+"m"; return Math.floor(m/60)+"h "+(m%60)+"m"; }

function computeToday(S){
  const a=startOfDay(Date.now()), b=a+DAY, now=Date.now();
  const byId={}; (S.categories||[]).forEach(c=>byId[c.id]=c);
  let total=0, active=null;
  for(const ev of (S.events||[])) total += overlap(ev.start, ev.end, a, b);
  for(const t of (S.timers||[])){ total += overlap(t.start, now, a, b); active={cat:byId[t.catId], start:t.start}; }
  return { total, active };
}

const col = (h,a) => { try{ return a==null ? new Color(h) : new Color(h,a); }catch(e){ return new Color("#8b8f98"); } };
function mix(hex, amt, toward){ // toward: 255=white, 0=black
  try{ const h=hex.replace("#",""); let r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);
    r=Math.round(r+(toward-r)*amt); g=Math.round(g+(toward-g)*amt); b=Math.round(b+(toward-b)*amt);
    return "#"+[r,g,b].map(x=>Math.max(0,Math.min(255,x)).toString(16).padStart(2,"0")).join(""); }catch(e){ return hex; }
}
const lighten = (h,a)=>mix(h,a,255), darken = (h,a)=>mix(h,a,0);

function tintedBg(w, hex){
  const g = new LinearGradient();
  g.colors = [col(darken(hex,0.62)), col("#0c0d11")]; g.locations = [0,1];
  g.startPoint = new Point(0,0); g.endPoint = new Point(0.4,1);
  w.backgroundGradient = g;
}
function neutralBg(w){
  const g = new LinearGradient();
  g.colors = [col("#191c24"), col("#0c0d11")]; g.locations=[0,1];
  g.startPoint=new Point(0,0); g.endPoint=new Point(0,1); w.backgroundGradient=g;
}

async function build(){
  const w = new ListWidget();
  // no w.url → tapping the widget re-runs this script (refresh with latest data).
  // Set w.url = APP_URL instead if you'd rather a tap open the app.
  w.setPadding(16,17,16,17);

  let data;
  try{ data = await loadData(); }
  catch(e){
    neutralBg(w);
    const t=w.addText("Moment Meter Now"); t.textColor=col(INK); t.font=Font.boldSystemFont(14);
    w.addSpacer(4);
    const err=w.addText("Add your Gist ID + token at the top."); err.textColor=col("#e3574e"); err.font=Font.systemFont(11);
    return w;
  }
  const { total, active } = computeToday(data);

  if(active){
    const c = active.cat ? active.cat.color : "#d4408f";
    tintedBg(w, c);
    // header
    const top = w.addStack(); top.centerAlignContent();
    const dot = top.addStack(); dot.size=new Size(8,8); dot.backgroundColor=col(lighten(c,0.25)); dot.cornerRadius=4;
    top.addSpacer(7);
    const lbl = top.addText("NOW TRACKING"); lbl.font=Font.semiboldSystemFont(10); lbl.textColor=col(lighten(c,0.35));
    w.addSpacer();
    // category name
    const nm = w.addText(active.cat ? active.cat.name : "Tracking");
    nm.font=Font.boldSystemFont(21); nm.textColor=col(INK); nm.lineLimit=2; nm.minimumScaleFactor=0.55;
    w.addSpacer(4);
    // big LIVE timer (own line, conservative size so h:mm:ss never clips)
    const d = w.addDate(new Date(active.start));
    d.applyTimerStyle(); d.font=Font.boldSystemFont(28); d.textColor=col(lighten(c,0.5));
    w.addSpacer();
    // today total
    const tot = w.addText("today · " + fmtDur(total)); tot.font=Font.mediumSystemFont(12); tot.textColor=col(SUB);
  } else {
    neutralBg(w);
    const lbl = w.addText("MOMENT METER"); lbl.font=Font.semiboldSystemFont(10); lbl.textColor=col(FAINT);
    w.addSpacer();
    const tot = w.addText(fmtDur(total)); tot.font=Font.boldSystemFont(30); tot.textColor=col(INK);
    const sub = w.addText("tracked today"); sub.font=Font.mediumSystemFont(12); sub.textColor=col(SUB);
    w.addSpacer();
    const idle = w.addText("Not tracking · tap to start"); idle.font=Font.systemFont(11.5); idle.textColor=col(FAINT); idle.lineLimit=1; idle.minimumScaleFactor=0.7;
  }

  w.refreshAfterDate = new Date(Date.now() + (active ? 30 : 120) * 1000);
  return w;
}

const widget = await build();
if(config.runsInWidget) Script.setWidget(widget);
else await widget.presentSmall();
Script.complete();
