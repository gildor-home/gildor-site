/* ============================================================
   GILDOR — shared site enhancements
   - custom glowing cursor with trail
   - in-place page navigation: background/audio never restart
   - ambient sound toggle (procedural wind/leaves texture), on by default
   - time-of-day value (window.gildorDayMix) for shader tinting
   - generative per-visit seed (window.gildorSeed) for shader variation
   ============================================================ */

(function(){

  /* ---------- generative seed (varies each visit) ---------- */
  window.gildorSeed = Math.random() * 1000;

  /* ---------- time of day → warm/cool mix, from the visitor's own clock ---------- */
  function computeDayMix(){
    const now = new Date();
    const hour = now.getHours() + now.getMinutes()/60;
    return Math.cos((hour - 17) / 24 * Math.PI * 2);
  }
  window.gildorDayMix = computeDayMix();

  /* ---------- custom cursor (skipped on touch devices) ----------
     Uses id="gildorCursorStyle" so it can never be confused with the
     page's own id="pageStyle" stylesheet during navigation. ---------- */
  const isTouch = window.matchMedia('(pointer: coarse)').matches;

  if(!isTouch){
    const cursorStyle = document.createElement('style');
    cursorStyle.id = 'gildorCursorStyle';
    cursorStyle.textContent = `
      body, a, button { cursor:none !important; }
      .gildor-cursor-dot{
        position:fixed; top:0; left:0; width:7px; height:7px; border-radius:50%;
        background:#c9a44c; pointer-events:none; z-index:99998;
        box-shadow:0 0 10px 3px rgba(201,164,76,0.7), 0 0 22px 8px rgba(201,164,76,0.25);
        transform:translate(-50%,-50%); transition:width .2s ease, height .2s ease;
        mix-blend-mode:screen;
      }
      .gildor-cursor-trail{
        position:fixed; top:0; left:0; width:26px; height:26px; border-radius:50%;
        border:1px solid rgba(201,164,76,0.35); pointer-events:none; z-index:99997;
        transform:translate(-50%,-50%);
      }
      .gildor-cursor-dot.hover{ width:14px; height:14px; }
    `;
    document.head.appendChild(cursorStyle);

    const dot = document.createElement('div');
    dot.className = 'gildor-cursor-dot';
    const trail = document.createElement('div');
    trail.className = 'gildor-cursor-trail';
    document.body.appendChild(trail);
    document.body.appendChild(dot);

    let mx=window.innerWidth/2, my=window.innerHeight/2;
    let tx=mx, ty=my;
    window.addEventListener('mousemove', (e)=>{ mx=e.clientX; my=e.clientY; });

    function cursorLoop(){
      dot.style.left = mx+'px'; dot.style.top = my+'px';
      tx += (mx-tx)*0.14; ty += (my-ty)*0.14;
      trail.style.left = tx+'px'; trail.style.top = ty+'px';
      requestAnimationFrame(cursorLoop);
    }
    cursorLoop();

    document.addEventListener('mouseover', (e)=>{
      if(e.target.closest('a, button, .portal, .entry, .issue')) dot.classList.add('hover');
    });
    document.addEventListener('mouseout', (e)=>{
      if(e.target.closest('a, button, .portal, .entry, .issue')) dot.classList.remove('hover');
    });
  }

  /* ---------- internal-link detection ----------
     Matches "gildor-archive", "gildor-archive.html", "/gildor-archive",
     "index", "index.html", "/index" — covers plain filenames and whatever
     pretty-URL rewriting a host (e.g. Netlify) applies. ---------- */
  function isInternalHref(href){
    return !!href && /^\/?(gildor-[a-z]+|index)(\.html)?$/.test(href);
  }

  /* ---------- page navigation: swap content in place, background/audio never restart ---------- */
  const overlay = document.createElement('div');
  overlay.id = 'gildorPageTransition';
  overlay.style.cssText = `
    position:fixed; inset:0; z-index:99999;
    background:#0d1420 center/cover no-repeat;
    opacity:0; pointer-events:none;
    filter: blur(0px);
    transition: opacity .5s ease, filter .5s ease;
  `;
  document.body.appendChild(overlay);

  const savedFrame = sessionStorage.getItem('gildorTransitionFrame');
  if(savedFrame){
    overlay.style.backgroundImage = `url(${savedFrame})`;
    overlay.style.opacity = '1';
    sessionStorage.removeItem('gildorTransitionFrame');
    requestAnimationFrame(()=>{
      setTimeout(()=>{ overlay.style.filter = 'blur(24px)'; overlay.style.opacity = '0'; }, 120);
    });
  }

  function hardNavigate(href){
    const bgCanvas = document.getElementById('bg');
    let frame = null;
    try{ if(bgCanvas) frame = bgCanvas.toDataURL('image/jpeg', 0.85); }catch(err){}
    if(frame) sessionStorage.setItem('gildorTransitionFrame', frame);
    if(frame) overlay.style.backgroundImage = `url(${frame})`;
    overlay.style.filter = 'blur(0px)';
    overlay.style.pointerEvents = 'auto';
    overlay.style.opacity = '1';
    setTimeout(()=>{ window.location.href = href; }, 400);
  }

  async function swapPage(href, pushHistory){
    const pageEl = document.querySelector('.page');
    if(!pageEl) return hardNavigate(href);

    pageEl.style.transition = 'opacity .22s ease';
    pageEl.style.opacity = '0.1';
    await new Promise(r=> setTimeout(r, 220));

    let html;
    try{
      const res = await fetch(href, { cache:'no-store' });
      if(!res.ok) throw new Error('bad response: ' + res.status);
      html = await res.text();
    }catch(err){
      hardNavigate(href);
      return;
    }

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const newPage = doc.querySelector('.page');
    // target by id specifically — never the cursor's separately-injected
    // style tag, and never accidentally grab the wrong element
    const newStyle = doc.getElementById('pageStyle');
    const newLogic = doc.getElementById('pageLogic');
    const newTitle = doc.querySelector('title');
    if(!newPage){ hardNavigate(href); return; }

    const currentStyle = document.getElementById('pageStyle');
    if(newStyle && currentStyle){ currentStyle.textContent = newStyle.textContent; }

    pageEl.innerHTML = newPage.innerHTML;

    if(newTitle) document.title = newTitle.textContent;
    if(pushHistory){
      try{ history.pushState({ gildorHref: href }, '', href); }catch(err){}
    }

    try{
      if(newLogic){
        const s = document.createElement('script');
        s.textContent = '(function(){\n' + newLogic.textContent + '\n})();';
        document.body.appendChild(s);
        s.remove();
      }
    }catch(err){
      console.error('Gildor: page script error during navigation:', err);
    }finally{
      requestAnimationFrame(()=>{
        requestAnimationFrame(()=>{
          window.scrollTo(0, 0);
          document.documentElement.scrollTop = 0;
          document.body.scrollTop = 0;
          pageEl.style.opacity = '1';
        });
      });
    }
  }

  document.addEventListener('click', (e)=>{
    const link = e.target.closest('a');
    if(!link) return;
    const href = link.getAttribute('href');
    if(!isInternalHref(href)) return;
    e.preventDefault();
    swapPage(href, true);
  });

  window.addEventListener('popstate', (e)=>{
    const href = (e.state && e.state.gildorHref) || location.pathname.split('/').pop() || 'index.html';
    if(isInternalHref(href)) swapPage(href, false);
  });

  /* ---------- ambient sound: on by default, soft wind / rustling-leaves texture ---------- */
  let audioCtx = null, ambientNodes = null;
  let ambientOn = sessionStorage.getItem('gildorAmbientOn') !== '0';

  function makeNoiseBuffer(ctx, seconds){
    const bufferSize = ctx.sampleRate * seconds;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for(let i=0;i<bufferSize;i++) data[i] = Math.random()*2 - 1;
    return buffer;
  }

  function startAmbient(){
    if(audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    const master = audioCtx.createGain();
    master.gain.value = 0;
    master.connect(audioCtx.destination);
    master.gain.linearRampToValueAtTime(0.09, audioCtx.currentTime + 1.8);

    const windSrc = audioCtx.createBufferSource();
    windSrc.buffer = makeNoiseBuffer(audioCtx, 4);
    windSrc.loop = true;
    const windFilter = audioCtx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 500;
    windFilter.Q.value = 0.7;
    const windGain = audioCtx.createGain();
    windGain.gain.value = 0.5;
    windSrc.connect(windFilter); windFilter.connect(windGain); windGain.connect(master);
    windSrc.start();

    const windLFO = audioCtx.createOscillator();
    windLFO.frequency.value = 0.07;
    const windLFOGain = audioCtx.createGain();
    windLFOGain.gain.value = 260;
    windLFO.connect(windLFOGain); windLFOGain.connect(windFilter.frequency);
    windLFO.start();

    const windGustGain = audioCtx.createOscillator();
    windGustGain.frequency.value = 0.05;
    const windGustDepth = audioCtx.createGain();
    windGustDepth.gain.value = 0.18;
    windGustGain.connect(windGustDepth); windGustDepth.connect(windGain.gain);
    windGustGain.start();
    if(audioCtx.createConstantSource){
      const offset = audioCtx.createConstantSource();
      offset.offset.value = 0.35;
      offset.connect(windGain.gain);
      offset.start();
    }

    const leafSrc = audioCtx.createBufferSource();
    leafSrc.buffer = makeNoiseBuffer(audioCtx, 3);
    leafSrc.loop = true;
    const leafFilter = audioCtx.createBiquadFilter();
    leafFilter.type = 'bandpass';
    leafFilter.frequency.value = 3200;
    leafFilter.Q.value = 0.9;
    const leafGain = audioCtx.createGain();
    leafGain.gain.value = 0.22;
    leafSrc.connect(leafFilter); leafFilter.connect(leafGain); leafGain.connect(master);
    leafSrc.start();

    const leafLFO = audioCtx.createOscillator();
    leafLFO.frequency.value = 0.22;
    const leafLFOGain = audioCtx.createGain();
    leafLFOGain.gain.value = 900;
    leafLFO.connect(leafLFOGain); leafLFOGain.connect(leafFilter.frequency);
    leafLFO.start();

    ambientNodes = { master };
  }

  function stopAmbient(){
    if(!ambientNodes || !audioCtx) return;
    const ctx = audioCtx;
    ambientNodes.master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8);
    setTimeout(()=>{ ctx.close(); }, 900);
    audioCtx = null; ambientNodes = null;
  }

  function buildSoundToggle(){
    const btn = document.createElement('button');
    btn.id = 'gildorSoundToggle';
    btn.setAttribute('aria-label','Ήχος περιβάλλοντος');
    btn.title = 'Ήχος περιβάλλοντος — απαλό αεράκι';
    btn.style.cssText = `
      background:none; border:none; cursor:pointer; color:${ambientOn ? '#c9a44c' : 'rgba(244,239,225,0.5)'};
      display:flex; align-items:center; transition:color .25s ease; padding:0;
    `;
    btn.innerHTML = `<svg id="gildorSoundIcon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6">
      <path d="M4 9v6h4l5 4V5L8 9H4z"/>
      <path id="gildorSoundWave" d="M16 9a4 4 0 0 1 0 6" style="opacity:${ambientOn?1:0.4}"/>
    </svg>`;
    btn.addEventListener('mouseenter', ()=> btn.style.color = '#c9a44c');
    btn.addEventListener('mouseleave', ()=> btn.style.color = ambientOn ? '#c9a44c' : 'rgba(244,239,225,0.5)');
    btn.addEventListener('click', ()=>{
      ambientOn = !ambientOn;
      sessionStorage.setItem('gildorAmbientOn', ambientOn ? '1' : '0');
      if(ambientOn){ startAmbient(); btn.style.color = '#c9a44c'; }
      else { stopAmbient(); btn.style.color = 'rgba(244,239,225,0.5)'; }
      document.getElementById('gildorSoundWave').style.opacity = ambientOn ? '1' : '0.4';
    });
    return btn;
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    const yearEl = document.getElementById('footerYear');
    if(yearEl) yearEl.textContent = new Date().getFullYear();
    const socialRow = document.querySelector('.social-row');
    if(socialRow && socialRow.parentElement && !document.getElementById('gildorSoundToggle')){
      socialRow.parentElement.insertBefore(buildSoundToggle(), socialRow);
    }
    if(ambientOn) tryStartAmbientOnLoad();
  });

  function tryStartAmbientOnLoad(){
    try{
      startAmbient();
      if(audioCtx && audioCtx.state === 'suspended'){
        const resumeOnce = ()=>{ audioCtx && audioCtx.resume(); cleanup(); };
        const cleanup = ()=>{
          document.removeEventListener('click', resumeOnce);
          document.removeEventListener('keydown', resumeOnce);
          document.removeEventListener('touchstart', resumeOnce);
        };
        document.addEventListener('click', resumeOnce, { once:true });
        document.addEventListener('keydown', resumeOnce, { once:true });
        document.addEventListener('touchstart', resumeOnce, { once:true });
      }
    }catch(err){
      const startOnce = ()=>{ startAmbient(); cleanup(); };
      const cleanup = ()=>{
        document.removeEventListener('click', startOnce);
        document.removeEventListener('keydown', startOnce);
        document.removeEventListener('touchstart', startOnce);
      };
      document.addEventListener('click', startOnce, { once:true });
      document.addEventListener('keydown', startOnce, { once:true });
      document.addEventListener('touchstart', startOnce, { once:true });
    }
  }

})();


/* ============================================================
   GILDOR — CMS connection (Sanity)
   Reads published content from the Sanity project. If anything fails,
   or nothing is published yet, every page simply keeps its built-in text.

   Pages mark what the CMS may replace with attributes:
     data-cms="field"            text from Site Settings  (e.g. footerStatus)
     data-cms="portal:nomad.name" a field of one of the 4 universes
     data-cms-inline             allow *highlighted* words (becomes <em>)
     data-cms-href="instagram"   link from Site Settings
   ============================================================ */
(function(){
  const PROJECT_ID = 't6wpnbue';   // <-- the 8-character project id from Sanity
  const DATASET = 'production';
  const API_VERSION = 'v2025-02-19';
  const TIMEOUT_MS = 7000;
  const HIDE_MS = 2500;            // never keep text hidden longer than this

  const enabled = /^[a-z0-9]{6,12}$/.test(PROJECT_ID);

  const SITE_NAMES = {
    nomad: 'World Nomad', music: 'Music of our Memories',
    cosmos: 'Out of this World', reinvented: 'Απάτητες Διαδρομές'
  };
  const MONTHS_SHORT = ['ΙΑΝ','ΦΕΒ','ΜΑΡ','ΑΠΡ','ΜΑΪ','ΙΟΥΝ','ΙΟΥΛ','ΑΥΓ','ΣΕΠ','ΟΚΤ','ΝΟΕ','ΔΕΚ'];

  function lang(){
    try{ return localStorage.getItem('gildorLang') || 'el'; }catch(err){ return 'el'; }
  }

  // Picks the visitor's language from a {el, en} field, falling back to Greek.
  function pick(field){
    if(field == null) return '';
    if(typeof field === 'string') return field;
    return field[lang()] || field.el || '';
  }

  async function query(groq){
    if(!enabled) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(()=> ctrl.abort(), TIMEOUT_MS);
    try{
      const url = 'https://' + PROJECT_ID + '.apicdn.sanity.io/' + API_VERSION +
                  '/data/query/' + DATASET + '?query=' + encodeURIComponent(groq);
      const res = await fetch(url, { signal: ctrl.signal, cache: 'no-cache' });
      if(!res.ok) throw new Error('Sanity responded ' + res.status);
      const json = await res.json();
      return json.result;
    }finally{
      clearTimeout(timer);
    }
  }

  /* ---------- Site Settings (fetched once, remembered for the visit) ---------- */
  const SETTINGS_QUERY = '*[_type=="siteSettings"] | order(_updatedAt desc)[0]';
  let settingsPromise = null;

  function cachedSettings(){
    try{ return JSON.parse(sessionStorage.getItem('gildorSettings') || 'null'); }catch(err){ return null; }
  }
  function settings(){
    if(!enabled) return Promise.resolve(null);
    if(!settingsPromise){
      settingsPromise = query(SETTINGS_QUERY).then(r=>{
        if(r){ try{ sessionStorage.setItem('gildorSettings', JSON.stringify(r)); }catch(err){} }
        return r || null;
      }).catch(()=> null);
    }
    return settingsPromise;
  }

  function portalOf(s, key){
    return ((s && s.portals) || []).find(p=> p && p.key === key) || null;
  }
  function siteName(s, key){
    const pt = portalOf(s, key);
    return (pt && pick(pt.name)) || SITE_NAMES[key] || key;
  }

  // reads "footerStatus" or "portal:nomad.name" out of the settings
  function valueFor(s, key){
    const m = /^portal:([a-z]+)\.(\w+)$/.exec(key);
    if(m){ const pt = portalOf(s, m[1]); return pt ? pt[m[2]] : null; }
    return s ? s[key] : null;
  }

  // "some *highlighted* words" -> text + <em>highlighted</em> (or another tag/class)
  function inline(el, text, tag, cls){
    el.textContent = '';
    String(text).split(/\*([^*]+)\*/).forEach((part, i)=>{
      if(i % 2){
        const t = document.createElement(tag || 'em');
        if(cls) t.className = cls;
        t.textContent = part;
        el.appendChild(t);
      }else if(part){
        el.appendChild(document.createTextNode(part));
      }
    });
  }

  function applyTo(nodes, s){
    nodes.forEach(n=>{
      const key = n.getAttribute('data-cms');
      if(key){
        const text = pick(valueFor(s, key));
        if(text){
          if(n.hasAttribute('data-cms-inline')) inline(n, text);
          else{ n.textContent = text; if(text.indexOf('\n') >= 0) n.style.whiteSpace = 'pre-line'; }
        }
      }
      let hrefKey = n.getAttribute('data-cms-href');
      if(hrefKey){
        let prefix = '';
        if(hrefKey.indexOf('mailto:') === 0){ prefix = 'mailto:'; hrefKey = hrefKey.slice(7); }
        const url = valueFor(s, hrefKey);
        if(typeof url === 'string' && url.trim()){
          n.setAttribute('href', prefix + url.trim());
          if(!prefix && /^https?:/i.test(url)){ n.setAttribute('target', '_blank'); n.setAttribute('rel', 'noopener'); }
        }
      }
    });
  }

  // Fills every data-cms element on the current page. Remembers the last answer
  // so later pages fill instantly, without a flash of the built-in text.
  function bind(){
    if(!enabled) return;
    const nodes = [...document.querySelectorAll('[data-cms],[data-cms-href]')];
    if(!nodes.length) return;
    const cached = cachedSettings();
    const toHide = cached ? [] : nodes.filter(n=> n.hasAttribute('data-cms'));
    if(cached) applyTo(nodes, cached);
    toHide.forEach(n=>{ n.style.transition = 'opacity .25s ease'; n.style.opacity = '0'; });
    const reveal = ()=> toHide.forEach(n=>{ if(n.isConnected) n.style.opacity = '1'; });
    const timer = setTimeout(reveal, HIDE_MS);
    settings().then(s=>{ if(s) applyTo(nodes.filter(n=> n.isConnected), s); })
      .finally(()=>{ clearTimeout(timer); reveal(); });
  }

  /* ---------- small helpers pages can use ---------- */
  function shortDate(dateStr){
    const d = new Date(dateStr + 'T12:00:00');
    if(isNaN(d)) return '';
    return String(d.getDate()).padStart(2, '0') + ' ' + MONTHS_SHORT[d.getMonth()];
  }
  function longDate(dateStr){
    const d = new Date(dateStr + 'T12:00:00');
    if(isNaN(d)) return '';
    return d.toLocaleDateString(lang() === 'en' ? 'en-GB' : 'el-GR', {day:'numeric', month:'long', year:'numeric'});
  }
  function imageUrl(url, w){
    return url ? url + '?w=' + (w || 900) + '&auto=format' : '';
  }

  // Sanity "block content" (the rich text with images) -> safe HTML elements
  function blockSpans(b){
    const defs = {};
    (b.markDefs || []).forEach(d=>{ defs[d._key] = d; });
    return (b.children || []).map(ch=>{
      let node = document.createTextNode(ch.text || '');
      (ch.marks || []).forEach(m=>{
        let wrap = null;
        if(m === 'strong') wrap = document.createElement('strong');
        else if(m === 'em') wrap = document.createElement('em');
        else if(m === 'underline') wrap = document.createElement('u');
        else if(m === 'code') wrap = document.createElement('code');
        else if(defs[m] && defs[m]._type === 'link' && /^(https?:|mailto:)/i.test(defs[m].href || '')){
          wrap = document.createElement('a');
          wrap.href = defs[m].href; wrap.target = '_blank'; wrap.rel = 'noopener';
        }
        if(wrap){ wrap.appendChild(node); node = wrap; }
      });
      return node;
    });
  }
  function renderBlocks(blocks, container){
    container.textContent = '';
    let list = null, listTag = null;
    (blocks || []).forEach(b=>{
      if(!b) return;
      if(b._type === 'image'){
        list = null;
        if(b.url){
          const img = document.createElement('img');
          img.src = imageUrl(b.url, 900); img.alt = ''; img.loading = 'lazy'; img.className = 'cms-img';
          container.appendChild(img);
        }
        return;
      }
      if(b._type !== 'block') return;
      const kids = blockSpans(b);
      if(b.listItem){
        const tag = b.listItem === 'number' ? 'ol' : 'ul';
        if(!list || listTag !== tag){ list = document.createElement(tag); listTag = tag; container.appendChild(list); }
        const li = document.createElement('li'); kids.forEach(k=> li.appendChild(k)); list.appendChild(li);
        return;
      }
      list = null;
      const tag = ({h1:'h2', h2:'h2', h3:'h3', h4:'h4', blockquote:'blockquote'})[b.style] || 'p';
      const el = document.createElement(tag); kids.forEach(k=> el.appendChild(k)); container.appendChild(el);
    });
  }

  window.gildorCMS = {
    enabled, query, pick, lang,
    settings, cachedSettings, bind, inline,
    portalOf, siteName, shortDate, longDate, imageUrl, renderBlocks, SITE_NAMES
  };
})();
