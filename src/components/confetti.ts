export function confettiBurst(opts?: { x?: number; y?: number }) {
  const c = document.createElement('canvas');
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const w = c.width = Math.floor(window.innerWidth * dpr);
  const h = c.height = Math.floor(window.innerHeight * dpr);
  c.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:120;';
  document.body.appendChild(c);
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);

  const colors = ['#38bdf8','#67e8f9','#0ea5e9','#a7f3d0','#fef08a'];
  const N = 140;
  const particles = Array.from({length:N}).map(()=>({
    x: (opts?.x ?? window.innerWidth/2) + (Math.random()*200-100),
    y: (opts?.y ?? window.innerHeight/2),
    vx: (Math.random()-0.5)*6,
    vy: - (Math.random()*8 + 6),
    g: 0.25 + Math.random()*0.2,
    s: 6 + Math.random()*6,
    r: Math.random()*Math.PI,
    vr: (Math.random()-0.5)*0.3,
    c: colors[(Math.random()*colors.length)|0]
  }));

  let t = 0;
  const maxT = 90; // ~1.5s
  (function loop(){
    t++;
    ctx.clearRect(0,0,window.innerWidth,window.innerHeight);
    particles.forEach(p=>{
      p.x += p.vx; p.y += p.vy; p.vy += p.g; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.fillStyle = p.c; ctx.fillRect(-p.s/2,-p.s/2,p.s,p.s);
      ctx.restore();
    });
    if (t < maxT) requestAnimationFrame(loop);
    else document.body.removeChild(c);
  })();
}
