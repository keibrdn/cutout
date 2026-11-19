// Cutout — Round 1
// Model coordinates: 1 unit = 1 pixel of the (capped) source photo.
// Canvas = photo + paper half, flush. Paper stamps are stored in paper-local coords,
// placed pieces in photo-local coords (so changing nothing else keeps them valid).

(() => {
  const MAX_SRC = 4096;      // downscale uploads larger than this
  const PREVIEW_MAX = 1400;  // backing-store size cap for on-screen canvas
  const SHAPE = new Path2D(window.SHAPES.blob); // unit box centered on origin

  const $ = (id) => document.getElementById(id);
  const main = $('main'), overlay = $('overlay'), wrap = $('wrap');
  const mctx = main.getContext('2d'), octx = overlay.getContext('2d');
  const hitCtx = document.createElement('canvas').getContext('2d');

  const state = {
    photo: null, PW: 0, PH: 0,
    side: 'right',
    color: '#efe6d0', noise: 0.55, crinkle: 0.30,
    size: 0.10,                 // stamp diameter as fraction of shorter photo edge
    stamps: [],                 // {lx,ly (hole, paper-local), px,py (piece, photo-local), rot, size}
    nextRot: Math.random() * Math.PI * 2,
    seed: Math.floor(Math.random() * 1e6),
    scale: 1, texCache: null,
    pointer: null, drag: null,
  };

  // ---------- geometry ----------
  function rects() {
    const { PW, PH, side } = state;
    switch (side) {
      case 'right':  return { P: { x: 0, y: 0 }, Q: { x: PW, y: 0 }, CW: PW * 2, CH: PH };
      case 'left':   return { P: { x: PW, y: 0 }, Q: { x: 0, y: 0 }, CW: PW * 2, CH: PH };
      case 'bottom': return { P: { x: 0, y: 0 }, Q: { x: 0, y: PH }, CW: PW, CH: PH * 2 };
      default:       return { P: { x: 0, y: PH }, Q: { x: 0, y: 0 }, CW: PW, CH: PH * 2 }; // top
    }
  }
  const stampDiameter = (s) => s * Math.min(state.PW, state.PH);

  // ---------- paper texture ----------
  function hash(ix, iy, seed) {
    let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 982451653);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  }
  function vnoise(x, y, seed) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed);
    const c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  let grainTile = null;
  function getGrainTile() {
    if (grainTile) return grainTile;
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d');
    const img = g.createImageData(512, 512);
    for (let i = 0; i < img.data.length; i += 4) {
      const r = Math.random() * 2 - 1;
      const v = r > 0 ? 255 : 0;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = Math.pow(Math.abs(r), 1.3) * 255;
    }
    g.putImageData(img, 0, 0);
    return (grainTile = c);
  }

  function makePaper(wpx, hpx) {
    const { PW, PH, color, noise, crinkle, seed } = state;
    const c = document.createElement('canvas');
    c.width = wpx; c.height = hpx;
    const g = c.getContext('2d');
    g.fillStyle = color;
    g.fillRect(0, 0, wpx, hpx);

    // crinkle: ridged fractal height map at low-res -> directional light shading
    if (crinkle > 0) {
      const short = Math.min(PW, PH);
      const ax = PW / short, ay = PH / short;
      const lw = Math.max(40, Math.round(500 * (PW >= PH ? 1 : PW / PH)));
      const lh = Math.max(40, Math.round(500 * (PH >= PW ? 1 : PH / PW)));
      const H = new Float32Array(lw * lh);
      const oct = [[2.5, 1, false], [6, 0.55, true], [14, 0.3, true], [30, 0.12, true]];
      for (let j = 0; j < lh; j++) for (let i = 0; i < lw; i++) {
        const u = (i / lw) * ax, v = (j / lh) * ay;
        let h = 0;
        for (let k = 0; k < oct.length; k++) {
          const [f, a, ridged] = oct[k];
          let n = vnoise(u * f, v * f, seed + k * 17);
          if (ridged) n = 1 - Math.abs(2 * n - 1);
          h += a * n;
        }
        H[j * lw + i] = h;
      }
      const S = new Float32Array(lw * lh);
      let sum2 = 0;
      for (let j = 1; j < lh - 1; j++) for (let i = 1; i < lw - 1; i++) {
        const gx = H[j * lw + i + 1] - H[j * lw + i - 1];
        const gy = H[(j + 1) * lw + i] - H[(j - 1) * lw + i];
        const s = -(gx + gy);
        S[j * lw + i] = s; sum2 += s * s;
      }
      const std = Math.sqrt(sum2 / (lw * lh)) || 1;
      const sc = document.createElement('canvas');
      sc.width = lw; sc.height = lh;
      const sg = sc.getContext('2d');
      const img = sg.createImageData(lw, lh);
      for (let p = 0; p < lw * lh; p++) {
        const s = Math.max(-1, Math.min(1, S[p] / (2.2 * std)));
        const o = p * 4;
        const v = s > 0 ? 255 : 0;
        img.data[o] = img.data[o + 1] = img.data[o + 2] = v;
        img.data[o + 3] = Math.abs(s) * 255 * 0.32 * crinkle;
      }
      sg.putImageData(img, 0, 0);
      g.imageSmoothingQuality = 'high';
      g.drawImage(sc, 0, 0, wpx, hpx);
    }

    // noise: film-grain speckle, grain size tied to the sheet so it looks the same at any export size
    if (noise > 0) {
      const grainPx = Math.max(1, (Math.min(PW, PH) / 900) * (wpx / PW));
      const pat = g.createPattern(getGrainTile(), 'repeat');
      pat.setTransform(new DOMMatrix().scale(grainPx));
      g.globalAlpha = Math.min(1, noise * 0.4);
      g.fillStyle = pat;
      g.fillRect(0, 0, wpx, hpx);
      g.globalAlpha = 1;
    }
    return c;
  }

  function getPaper(wpx, hpx) {
    const { color, noise, crinkle, seed, PW, PH } = state;
    const key = [color, noise, crinkle, seed, wpx, hpx, PW, PH].join('|');
    if (state.texCache && state.texCache.key === key) return state.texCache.tex;
    const tex = makePaper(wpx, hpx);
    state.texCache = { key, tex };
    return tex;
  }

  // ---------- rendering ----------
  // Draws the full composition into ctx whose canvas is cw x ch device pixels.
  function render(ctx, cw, ch) {
    const { PW, PH, photo, stamps } = state;
    const { P, Q, CW, CH } = rects();
    const sx = cw / CW, sy = ch / CH;
    const wpx = Math.round(PW * sx), hpx = Math.round(PH * sy);
    const tex = getPaper(wpx, hpx);

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.scale(sx, sy);

    // layer 1: photo + its duplicate, side by side
    ctx.drawImage(photo, P.x, P.y, PW, PH);
    ctx.drawImage(photo, Q.x, Q.y, PW, PH);

    // layer 2: paper with punched holes (alpha mask), drawn clipped to its half
    const layer = document.createElement('canvas');
    layer.width = wpx; layer.height = hpx;
    const lg = layer.getContext('2d');
    lg.drawImage(tex, 0, 0);
    lg.globalCompositeOperation = 'destination-out';
    lg.scale(wpx / PW, hpx / PH);
    for (const s of stamps) {
      lg.save();
      lg.translate(s.lx, s.ly);
      lg.rotate(s.rot);
      const d = stampDiameter(s.size);
      lg.scale(d, d);
      lg.fill(SHAPE);
      lg.restore();
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(Q.x, Q.y, PW, PH);
    ctx.clip();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = Math.max(1, 5 * Math.min(sx, sy));
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = Math.max(1, 1.5 * Math.min(sx, sy));
    ctx.drawImage(layer, Q.x, Q.y, PW, PH);
    ctx.restore();

    // pieces lying on the photo
    for (const s of stamps) {
      ctx.save();
      ctx.translate(P.x + s.px, P.y + s.py);
      ctx.rotate(s.rot);
      const d = stampDiameter(s.size);
      ctx.scale(d, d);
      // soft shadow under the piece
      ctx.shadowColor = 'rgba(0,0,0,0.30)';
      ctx.shadowBlur = Math.max(1, 4 * Math.min(sx, sy));
      ctx.shadowOffsetY = Math.max(1, 1.5 * Math.min(sx, sy));
      ctx.fillStyle = state.color;
      ctx.fill(SHAPE);
      ctx.shadowColor = 'transparent';
      ctx.save();
      ctx.clip(SHAPE);
      ctx.scale(1 / d, 1 / d);
      ctx.rotate(-s.rot);
      ctx.translate(-s.lx, -s.ly);
      ctx.drawImage(tex, 0, 0, PW, PH);
      ctx.restore();
      ctx.restore();
    }
    ctx.restore();
  }

  function redraw() {
    if (!state.photo) return;
    render(mctx, main.width, main.height);
    drawOverlay();
  }

  // ---------- overlay: dashed cursor preview ----------
  function drawOverlay() {
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, overlay.width, overlay.height);
    const p = state.pointer;
    if (!p || state.drag) return;
    const where = locate(p);
    if (where.kind !== 'paper') return;
    const { CW } = rects();
    const k = overlay.width / CW;
    octx.save();
    octx.scale(k, k);
    octx.translate(p.x, p.y);
    octx.rotate(state.nextRot);
    const d = stampDiameter(state.size);
    octx.scale(d, d);
    octx.lineJoin = 'round';
    octx.setLineDash([0.06, 0.05]);
    octx.lineWidth = 3.2 / (k * d);
    octx.strokeStyle = 'rgba(255,255,255,0.85)';
    octx.stroke(SHAPE);
    octx.lineWidth = 1.6 / (k * d);
    octx.strokeStyle = 'rgba(30,30,30,0.95)';
    octx.stroke(SHAPE);
    octx.restore();
  }

  // ---------- hit testing ----------
  function inPaper(p) {
    const { Q } = rects();
    return p.x >= Q.x && p.x < Q.x + state.PW && p.y >= Q.y && p.y < Q.y + state.PH;
  }
  function pieceAt(p) {
    const { P } = rects();
    for (let i = state.stamps.length - 1; i >= 0; i--) {
      const s = state.stamps[i];
      const dx = p.x - (P.x + s.px), dy = p.y - (P.y + s.py);
      const c = Math.cos(-s.rot), sn = Math.sin(-s.rot);
      const d = stampDiameter(s.size);
      const ux = (dx * c - dy * sn) / d, uy = (dx * sn + dy * c) / d;
      if (hitCtx.isPointInPath(SHAPE, ux, uy)) return i;
    }
    return -1;
  }
  function locate(p) {
    const i = pieceAt(p);
    if (i >= 0) return { kind: 'piece', index: i };
    if (inPaper(p)) return { kind: 'paper' };
    return { kind: 'photo' };
  }
  function toModel(e) {
    const r = main.getBoundingClientRect();
    const { CW, CH } = rects();
    return { x: ((e.clientX - r.left) / r.width) * CW, y: ((e.clientY - r.top) / r.height) * CH };
  }

  // ---------- interaction ----------
  overlay.addEventListener('pointermove', (e) => {
    const p = toModel(e);
    state.pointer = p;
    if (state.drag) {
      const { P } = rects();
      const s = state.stamps[state.drag.index];
      // pieces stay on the photo side
      s.px = Math.max(0, Math.min(state.PW, p.x - P.x - state.drag.ox));
      s.py = Math.max(0, Math.min(state.PH, p.y - P.y - state.drag.oy));
      redraw();
      return;
    }
    const w = locate(p);
    overlay.style.cursor = w.kind === 'paper' ? 'none' : w.kind === 'piece' ? 'grab' : 'default';
    drawOverlay();
  });
  overlay.addEventListener('pointerleave', () => { state.pointer = null; drawOverlay(); });
  overlay.addEventListener('pointerdown', (e) => {
    if (!state.photo) return;
    const p = toModel(e);
    state.pointer = p;
    const w = locate(p);
    if (w.kind === 'piece') {
      const { P } = rects();
      const s = state.stamps[w.index];
      // bring to top
      state.stamps.push(state.stamps.splice(w.index, 1)[0]);
      state.drag = { index: state.stamps.length - 1, ox: p.x - P.x - s.px, oy: p.y - P.y - s.py };
      overlay.setPointerCapture(e.pointerId);
      overlay.style.cursor = 'grabbing';
      redraw();
    } else if (w.kind === 'paper') {
      const { Q } = rects();
      const lx = p.x - Q.x, ly = p.y - Q.y;
      state.stamps.push({ lx, ly, px: lx, py: ly, rot: state.nextRot, size: state.size });
      state.nextRot = Math.random() * Math.PI * 2;
      redraw();
    }
  });
  const endDrag = (e) => {
    if (!state.drag) return;
    state.drag = null;
    try { overlay.releasePointerCapture(e.pointerId); } catch (_) {}
    overlay.style.cursor = 'grab';
    drawOverlay();
  };
  overlay.addEventListener('pointerup', endDrag);
  overlay.addEventListener('pointercancel', endDrag);

  // ---------- layout / sizing ----------
  function layout() {
    if (!state.photo) return;
    const { CW, CH } = rects();
    const s = Math.min(1, PREVIEW_MAX / Math.max(CW, CH));
    const w = Math.round(CW * s), h = Math.round(CH * s);
    for (const c of [main, overlay]) { c.width = w; c.height = h; }
    const stage = $('stage').getBoundingClientRect();
    const availW = stage.width - 32, availH = stage.height - 32;
    const fit = Math.min(availW / CW, availH / CH);
    wrap.style.width = Math.floor(CW * fit) + 'px';
    wrap.style.height = Math.floor(CH * fit) + 'px';
    redraw();
  }
  window.addEventListener('resize', layout);

  // ---------- loading images ----------
  function setPhoto(img) {
    let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    let src = img;
    const m = Math.max(w, h);
    if (m > MAX_SRC) {
      const k = MAX_SRC / m;
      const c = document.createElement('canvas');
      c.width = Math.round(w * k); c.height = Math.round(h * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      src = c; w = c.width; h = c.height;
    }
    state.photo = src; state.PW = w; state.PH = h;
    state.stamps = [];
    state.seed = Math.floor(Math.random() * 1e6);
    state.texCache = null;
    // default side + allowed sides depend on orientation
    state.side = h > w ? 'right' : w > h ? 'top' : 'right';
    updateSideButtons();
    $('empty').hidden = true;
    wrap.hidden = false;
    layout();
  }
  function allowedSides() {
    const { PW, PH } = state;
    if (PH > PW) return ['left', 'right'];
    if (PW > PH) return ['top', 'bottom'];
    return ['top', 'bottom', 'left', 'right'];
  }
  function updateSideButtons() {
    const ok = state.photo ? allowedSides() : [];
    document.querySelectorAll('#sides button').forEach((b) => {
      b.disabled = !ok.includes(b.dataset.side);
      b.classList.toggle('on', b.dataset.side === state.side);
    });
  }
  function loadUrl(url, revoke) {
    const img = new Image();
    img.onload = () => { setPhoto(img); if (revoke) URL.revokeObjectURL(url); };
    img.src = url;
  }

  $('file').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) loadUrl(URL.createObjectURL(f), true);
  });
  document.querySelectorAll('[data-stock]').forEach((b) =>
    b.addEventListener('click', () => loadUrl(b.dataset.stock)));

  // ---------- controls ----------
  document.querySelectorAll('#sides button').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.disabled || b.dataset.side === state.side) return;
      state.side = b.dataset.side;
      state.stamps = []; // positions are relative to the layout; start fresh
      updateSideButtons();
      layout();
    }));

  const PRESETS = ['#efe6d0', '#f4f2ee', '#c5cf9f', '#c9d6e6', '#f0cfd0', '#e3b98a', '#2f2f2d'];
  PRESETS.forEach((c) => {
    const b = document.createElement('button');
    b.className = 'swatch'; b.style.background = c; b.title = c;
    b.addEventListener('click', () => { $('color').value = c; state.color = c; redraw(); });
    $('swatches').appendChild(b);
  });
  $('color').addEventListener('input', (e) => { state.color = e.target.value; redraw(); });

  let debounce;
  function bindSlider(id, valId, apply, fmt) {
    const el = $(id), out = $(valId);
    const sync = () => { out.textContent = fmt(+el.value); };
    el.addEventListener('input', () => { sync(); apply(+el.value); clearTimeout(debounce); debounce = setTimeout(redraw, 16); });
    sync();
  }
  bindSlider('noise', 'noiseV', (v) => (state.noise = v / 100), (v) => v);
  bindSlider('crinkle', 'crinkleV', (v) => (state.crinkle = v / 100), (v) => v);
  bindSlider('size', 'sizeV', (v) => { state.size = v / 100; drawOverlay(); }, (v) => v + '%');

  $('undo').addEventListener('click', () => { state.stamps.pop(); redraw(); });
  $('reset').addEventListener('click', () => { state.stamps = []; redraw(); });

  // ---------- export ----------
  $('download').addEventListener('click', () => {
    if (!state.photo) return;
    const { CW, CH } = rects();
    const mode = $('exportSize').value;
    const out = document.createElement('canvas');
    if (mode === 'original') {
      out.width = Math.round(CW); out.height = Math.round(CH);
      render(out.getContext('2d'), out.width, out.height);
    } else {
      const TW = 1080, TH = 1920;
      const k = Math.max(TW / CW, TH / CH); // cover
      const full = document.createElement('canvas');
      full.width = Math.round(CW * k); full.height = Math.round(CH * k);
      render(full.getContext('2d'), full.width, full.height);
      out.width = TW; out.height = TH;
      const g = out.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(full, (TW - full.width) / 2, (TH - full.height) / 2);
    }
    out.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `cutout-${mode}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, 'image/png');
  });

  updateSideButtons();
  // start with first stock image
  loadUrl('StockImages/stockImage1.jpg');
})();
