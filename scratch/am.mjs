const API="https://api.videreproject.com";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function j(p){ for(let a=1;;a++){ try{ const r=await fetch(API+p); if(r.ok){ await sleep(200); return r.json(); } }catch(e){} if(a>=5) throw new Error(p); await sleep(1500*a);} }
const add=(d,n)=>{const t=new Date(d+"T00:00:00Z");t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10);};
const evs=[]; for(let off=0;;){ const r=await j(`/events?format=legacy&kind=challenge&min_date=2026-08-01&max_date=2026-11-30&limit=100&offset=${off}`); evs.push(...r.data); if(!r.meta?.has_more) break; off=r.meta.next_offset; }
console.log("events",evs.length);
for(const e of evs){ const d=e.date.slice(0,10), w=`&min_date=${add(d,-2)}&max_date=${add(d,2)}&limit=500`;
  const decks=(await j(`/decks?event_id=${e.id}${w}`)).data||[];
  const hits=decks.filter(x=>(x.mainboard||[]).some(c=>c.name==="Anthropological Mission"));
  if(!hits.length) continue;
  const st=(await j(`/standings?event_id=${e.id}${w}`)).data||[];
  for(const h of hits){ const s=st.find(x=>x.player===h.player)||{};
    console.log("HIT "+JSON.stringify({date:d,event:e.name,players:e.players,player:h.player,rank:s.rank,record:s.record,arch:s.archetype,mb:h.mainboard.map(c=>c.quantity+" "+c.name),sb:(h.sideboard||[]).map(c=>c.quantity+" "+c.name)})); } }
