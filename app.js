(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const C = window.WheelCore;
  const storageKey = 'gluecksrad.v1';
  const defaults = { duration: 6, speed: 3, sound: true, confetti: true, removeWinner: false, palette: 'konfetti' };
  const initialText = 'Emma\nNoah\nMia\nLeon\nHannah\nBen\nLina\nPaul';
  const palettes = {
    konfetti: ['#aa85df', '#8b69ce', '#c485bd', '#e99fae', '#efba83', '#edd28d', '#9cc7b3', '#93b5d5'],
    pastell: ['#c8ace7', '#b4a5df', '#d5b0d4', '#edb6c8', '#edc9ae', '#e5d5a4', '#b5d4bf', '#b1c8df'],
    ozean: ['#6384b5', '#6d9bcb', '#8cb6d3', '#98c6d0', '#9cd3c9', '#7bb8ad', '#729ca8', '#7d95bc']
  };
  let settings = { ...defaults }, mode = 'standard', history = [], text = initialText;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && typeof saved === 'object') {
      if (typeof saved.text === 'string') text = saved.text;
      if (['standard', 'pairs', 'teams'].includes(saved.mode)) mode = saved.mode;
      if (Array.isArray(saved.history)) history = saved.history.filter(x => typeof x === 'string').slice(0, 8);
      if (saved.settings && typeof saved.settings === 'object') {
        const s = saved.settings;
        if (Number.isFinite(s.duration)) settings.duration = Math.max(3, Math.min(15, s.duration));
        if (Number.isFinite(s.speed)) settings.speed = Math.max(1, Math.min(5, s.speed));
        for (const name of ['sound', 'confetti', 'removeWinner']) if (typeof s[name] === 'boolean') settings[name] = s[name];
        if (Object.hasOwn(palettes, s.palette)) settings.palette = s.palette;
      }
    }
  } catch (_) { /* Local storage may be unavailable in private contexts. */ }
  let entries = C.parseEntries(text), busy = false, rotation = 0, resultGroups = [], resultMode = null;
  let selectedIndex = null, selectedName = '', removed = false, toastTimer, saveTimer, animationId;
  let audio = null, lastTick = 0, reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = $('wheel'), ctx = canvas.getContext('2d');
  $('entries').value = text;

  function toast(message) {
    $('toast').textContent = message;
    $('toast').classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3500);
  }
  function persist() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ text: $('entries').value, settings, history, mode }));
      $('save-status').replaceChildren();
      const dot = document.createElement('span'); dot.className = 'status-dot';
      $('save-status').append(dot, 'Automatisch gespeichert');
    } catch (_) { $('save-status').textContent = 'Nur in dieser Sitzung · bitte Liste speichern'; }
  }
  function colorAt(index) { return palettes[settings.palette][index % 8]; }
  function drawWheel() {
    const size = canvas.width, center = size / 2, radius = center - 1;
    ctx.clearRect(0, 0, size, size);
    ctx.save(); ctx.translate(center, center); ctx.rotate(rotation);
    const count = entries.length || 8, slice = C.TAU / count;
    for (let i = 0; i < count; i++) {
      const start = -Math.PI / 2 + i * slice;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, radius, start, start + slice); ctx.closePath();
      ctx.fillStyle = entries.length ? colorAt(i) : (i % 2 ? '#e7dff3' : '#eee7f7'); ctx.fill();
      if (count <= 150) { ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 2.1; ctx.stroke(); }
      if (entries.length && count <= 90) {
        ctx.save(); ctx.rotate(start + slice / 2);
        const fontSize = Math.min(43, Math.max(11, 210 / Math.sqrt(count)));
        ctx.font = `600 ${fontSize}px Inter, "Segoe UI", sans-serif`;
        const dark = settings.palette !== 'konfetti' || i % 8 !== 1;
        ctx.fillStyle = dark ? '#3e2e50' : '#fff';
        ctx.textBaseline = 'middle';
        let label = entries[i], maxWidth = radius * .63;
        if (ctx.measureText(label).width > maxWidth) {
          while (label.length && ctx.measureText(label + '…').width > maxWidth) label = label.slice(0, -1);
          label += '…';
        }
        ctx.textAlign = 'right'; ctx.fillText(label, radius * .89, 0); ctx.restore();
      }
    }
    ctx.restore();
    if (!entries.length) {
      ctx.font = '500 32px Inter, sans-serif';ctx.fillStyle = '#ad9cbe';ctx.textAlign = 'center';
      ctx.fillText('Deine Ideen fehlen noch', center, center + 145);
    }
  }
  function lineMarkers() {
    const lines = $('entries').value.split(/\r\n|\r|\n/), fragment = document.createDocumentFragment();
    let colorIndex = 0;
    // Only mounted lines need markers; the textarea keeps the complete original text.
    const first = Math.max(0, Math.floor($('entries').scrollTop / lineHeight()) - 2);
    const last = Math.min(lines.length, first + 60);
    $('line-numbers').replaceChildren();
    const spacer = document.createElement('div'); spacer.style.height = `${first * lineHeight()}px`;fragment.append(spacer);
    colorIndex = lines.slice(0, first).filter(x => x.trim()).length;
    for (let index = first; index < last; index++) {
      const row = document.createElement('div');row.className = 'line-marker';
      const num = document.createElement('span');num.textContent = String(index + 1);
      const dot = document.createElement('i');
      dot.style.background = lines[index].trim() ? colorAt(colorIndex++) : 'transparent';
      row.append(num, dot);fragment.append(row);
    }
    $('line-numbers').append(fragment);
    $('line-numbers').scrollTop = $('entries').scrollTop;
  }
  function lineHeight() { return parseFloat(getComputedStyle($('entries')).lineHeight); }
  function invalidateResults() {
    resultGroups = [];resultMode = null;renderResults();showEditorTab('entries');
    document.body.classList.remove('result-ready');
    $('wheel-caption').textContent = mode === 'standard' ? 'Jeder Eintrag hat die gleiche Chance. Viel Glück!' : 'Zufällig gemischt. Fair aufgeteilt. Los geht’s!';
  }
  function updateEntries(invalidate = true) {
    entries = C.parseEntries($('entries').value);
    $('entry-count').textContent = entries.length;
    $('tab-count').textContent = entries.length;
    $('line-count').textContent = `${entries.length} ${entries.length === 1 ? 'Eintrag' : 'Einträge'}`;
    canvas.setAttribute('aria-label', `Glücksrad mit ${entries.length} gleich großen Feldern. ${entries.length < 25 ? entries.join(', ') : ''}`);
    lineMarkers();drawWheel();if (invalidate) invalidateResults();updateControls();
  }
  function updateControls() {
    const min = mode === 'standard' ? 1 : 2;
    $('spin').disabled = busy || entries.length < min;
    $('hub-spin').disabled = busy || entries.length < min;
    $('spin-again').disabled = busy || entries.length < min;
    $('entries').readOnly = busy;
    for (const id of ['shuffle', 'clear', 'load-list', 'open-settings', 'team-number', 'teams-minus', 'teams-plus']) $(id).disabled = busy;
    document.querySelectorAll('.mode').forEach(el => el.disabled = busy);
    $('save-list').disabled = showResults ? !resultGroups.length : !entries.length;
    $('clear').disabled = busy || !entries.length;
    $('shuffle').disabled = busy || entries.length < 2;
    $('spin-label').textContent = busy ? 'Der Zufall entscheidet …' : ({standard:'Rad drehen',pairs:'Paare auslosen',teams:'Teams auslosen'})[mode];
    $('spin-help').replaceChildren();
    if (entries.length < min) $('spin-help').textContent = `Trage mindestens ${min === 1 ? 'einen Eintrag' : 'zwei Einträge'} ein.`;
    else { $('spin-help').append('Oder drücke die ');const k = document.createElement('kbd');k.textContent='Leertaste';$('spin-help').append(k); }
    $('ready-badge').classList.toggle('spinning', busy);
    $('ready-badge').replaceChildren();const dot = document.createElement('span');
    $('ready-badge').append(dot, busy ? ' Ein bisschen Spannung …' : ' Bereit, wenn du es bist');
    document.body.classList.toggle('busy',busy);
  }
  let showResults = false;
  function showEditorTab(tab) {
    showResults = tab === 'results' && mode !== 'standard';
    for (const [id, active] of [['entries',!showResults],['results',showResults]]) {
      const button = $(`tab-${id}`); button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
      $(`${id}-panel`).hidden=!active;
    }
    $('save-list').querySelector('span').textContent = showResults ? 'Ergebnis speichern' : 'Liste speichern';
    updateControls();
  }
  function setMode(next) {
    if (busy) return;
    mode = next;
    document.querySelectorAll('.mode').forEach(el => {
      const active = el.dataset.mode === mode;el.classList.toggle('active',active);el.setAttribute('aria-selected',String(active));el.tabIndex=active?0:-1;
    });
    $('tab-results').hidden = mode === 'standard';
    $('team-control').hidden = mode !== 'teams';
    $('editor-description').textContent = {standard:'Eine Zeile, ein Eintrag. Dein Rad, deine Regeln.',pairs:'Eine Zeile, ein Name. Wer gehört wohl zusammen?',teams:'Eine Zeile, ein Name. Gemeinsam wird’s noch besser.'}[mode];
    invalidateResults();updateControls();persist();
  }
  function renderHistory() {
    $('history').replaceChildren();
    if (!history.length) { const p=document.createElement('span');p.className='history-placeholder';p.textContent='Dein nächster Glücksmoment wartet schon.';$('history').append(p); }
    history.forEach(name=>{const chip=document.createElement('span');chip.className='history-chip';chip.textContent=name;chip.title=name;$('history').append(chip);});
    $('clear-history').hidden=!history.length;
  }
  function renderResults() {
    $('results-count').textContent = resultGroups.length;
    const panel = $('results-panel');panel.replaceChildren();
    if (!resultGroups.length) {
      const empty=document.createElement('div');empty.className='empty-results';
      const spark=document.createElement('span');spark.textContent='✧';spark.style.cssText='font-size:40px;margin-bottom:18px;color:#c9b6e0';
      const title=document.createElement('strong');title.textContent='Der Zufall ist am Zug.';
      const hint=document.createElement('p');hint.textContent='Trage Namen ein und starte die Auslosung. Hier findest du danach dein Ergebnis.';
      empty.append(spark,title,hint);panel.append(empty);return;
    }
    resultGroups.forEach((names,i)=>{
      const group=document.createElement('div');group.className='result-group';
      const index=document.createElement('span');index.className='result-index';index.textContent=String(i+1).padStart(2,'0');
      const content=document.createElement('div');content.className='result-names';
      if (resultMode==='teams') {const heading=document.createElement('strong');heading.textContent=`TEAM ${i+1} · ${names.length} ${names.length===1?'PERSON':'PERSONEN'}`;content.append(heading);}
      if (resultMode==='pairs' && names.length===1) {const heading=document.createElement('strong');heading.textContent='DIESMAL OHNE PARTNER';content.append(heading);}
      content.append(names.join(resultMode==='pairs'?' ＋ ':' · '));
      group.append(index,content);panel.append(group);
    });
    const copy=document.createElement('button');copy.className='text-button';copy.textContent='Ergebnisse kopieren';copy.style.cssText='display:block;margin:12px auto';copy.addEventListener('click',copyResults);panel.append(copy);
  }
  function resultText() {
    return resultGroups.map((names,i)=>resultMode==='teams'?`Team ${i+1}: ${names.join(', ')}`:names.length===1?`Ohne Partner: ${names[0]}`:`${names[0]} - ${names[1]}`).join('\n');
  }
  async function copyResults() {
    try { await navigator.clipboard.writeText(resultText());toast('Ergebnisse kopiert.'); }
    catch (_) {toast('Kopieren ist hier nicht verfügbar. Speichere das Ergebnis als Textdatei.');}
  }
  function initAudio() {
    if (!settings.sound) return;
    try {audio ||= new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume().catch(()=>{});}catch(_){audio=null;}
  }
  function tone(frequency,duration=.035,gain=.035,delay=0,type='sine') {
    if (!settings.sound||!audio||audio.state!=='running')return;
    try { const start=audio.currentTime+delay,osc=audio.createOscillator(),amp=audio.createGain();osc.type=type;osc.frequency.setValueAtTime(frequency,start);amp.gain.setValueAtTime(.0001,start);amp.gain.exponentialRampToValueAtTime(gain,start+.005);amp.gain.exponentialRampToValueAtTime(.0001,start+duration);osc.connect(amp);amp.connect(audio.destination);osc.start(start);osc.stop(start+duration+.01);osc.onended=()=>{osc.disconnect();amp.disconnect();}; }catch(_){}
  }
  function winSound() { [523.25,659.25,783.99,1046.5].forEach((f,i)=>tone(f,.28,.055,i*.095)); }
  function spin() {
    if (busy||entries.length<(mode==='standard'?1:2)||$('settings-dialog').open)return;
    initAudio();busy=true;selectedIndex=C.randomInt(entries.length);selectedName=entries[selectedIndex];removed=false;
    const snapshot=[...entries];
    const groups=mode==='pairs'?C.makePairs(snapshot):mode==='teams'?C.makeTeams(snapshot,teamCount()):[];
    const current=rotation,turns=4+settings.speed*2;
    const target=C.targetRotation(current,selectedIndex,entries.length,turns,.22+C.randomInt(5600)/10000);
    const duration=(reducedMotion?.4:settings.duration)*1000,start=performance.now();
    let lastSector=-1;lastTick=0;updateControls();document.body.classList.remove('result-ready');
    $('wheel-caption').textContent=mode==='standard'?'Wer wird es wohl?':'Der Zufall bringt euch zusammen …';
    function frame(now) {
      const progress=Math.min((now-start)/duration,1), eased=1-Math.pow(1-progress,4);
      rotation=current+(target-current)*eased;drawWheel();
      const sector=Math.floor(rotation/(C.TAU/entries.length));
      if(sector!==lastSector&&now-lastTick>55&&progress<.985){tone(680,.022,.025,0,'triangle');lastTick=now;lastSector=sector;}
      if(progress<1)animationId=requestAnimationFrame(frame);
      else {rotation=C.mod(target,C.TAU);drawWheel();finish(groups);}
    }
    animationId=requestAnimationFrame(frame);
  }
  function finish(groups) {
    busy=false;updateControls();winSound();
    if(mode==='standard') {
      history.unshift(selectedName);history=history.slice(0,8);renderHistory();
      $('winner-name').textContent=selectedName;
      $('wheel-caption').textContent=`Ausgewählt: ${selectedName}`;
      if(settings.removeWinner) removeSelected(false);
      $('remove-entry').hidden=removed;
      $('winner-dialog').showModal();
    } else {
      resultGroups=groups;resultMode=mode;renderResults();showEditorTab('results');
      const odd=mode==='pairs'&&entries.length%2===1;
      $('wheel-caption').textContent=mode==='pairs'?`${Math.floor(entries.length/2)} ${Math.floor(entries.length/2)===1?'Paar ist':'Paare sind'} bereit.${odd?' Eine Person bleibt diesmal ohne Partner.':''}`:`${groups.length} Teams sind bereit. Auf geht’s!`;
      if(document.body.classList.contains('focus-mode'))toggleFocus(false);
      if(innerWidth<731)$('entry-count').scrollIntoView({behavior:reducedMotion?'instant':'smooth',block:'start'});
      toast(mode==='pairs'?'Deine Paare sind ausgelost!':'Deine Teams sind ausgelost!');
    }
    document.body.classList.add('result-ready');
    if(settings.confetti&&!reducedMotion)celebrate();
    persist();
  }
  function removeSelected(notify=true) {
    if(removed||selectedIndex===null)return;
    const items=[...entries];
    if(items[selectedIndex]!==selectedName)return;
    items.splice(selectedIndex,1);$('entries').value=items.join('\n');removed=true;
    updateEntries(false);$('remove-entry').hidden=true;persist();
    if(notify)toast('Eintrag entfernt. Die nächste Runde kann kommen.');
  }
  function teamCount() {
    let count=Number($('team-number').value);
    count=Number.isFinite(count)?Math.max(2,Math.min(50,Math.floor(count))):2;
    $('team-number').value=count;return count;
  }
  function download(text,filename) {
    const blob=new Blob(['\uFEFF'+text],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  function syncSettings() {
    $('duration').value=settings.duration;$('duration-value').textContent=`${settings.duration} Sekunden`;
    $('speed').value=settings.speed;$('speed-value').textContent=['Sehr gemütlich','Gemütlich','Normal','Schnell','Rasant'][settings.speed-1];
    $('sound').checked=settings.sound;$('confetti').checked=settings.confetti;$('remove-winner').checked=settings.removeWinner;
    document.querySelectorAll('[name=palette]').forEach(el=>el.checked=el.value===settings.palette);
    const label=settings.sound?'Ton ausschalten':'Ton einschalten';
    $('toggle-sound').setAttribute('aria-label',label);$('toggle-sound').title=label;$('toggle-sound').setAttribute('aria-pressed',String(settings.sound));
    $('toggle-sound').querySelector('use').setAttribute('href',settings.sound?'#i-sound':'#i-muted');
  }
  function toggleFocus(force) {
    const active=typeof force==='boolean'?force:!document.body.classList.contains('focus-mode');
    document.body.classList.toggle('focus-mode',active);$('fullscreen').setAttribute('aria-pressed',String(active));
    $('fullscreen').setAttribute('aria-label',active?'Fokusansicht verlassen':'Fokusansicht öffnen');
    $('fullscreen').title=active?'Fokusansicht verlassen':'Fokusansicht';
  }
  function celebrate() {
    const confetti=$('confetti-canvas'),context=confetti.getContext('2d');
    const width=innerWidth,height=innerHeight;confetti.width=width*devicePixelRatio;confetti.height=height*devicePixelRatio;context.scale(devicePixelRatio,devicePixelRatio);
    const pieces=Array.from({length:95},()=>({x:width*.5,y:height*.4,vx:(Math.random()-.5)*14,vy:-Math.random()*11-2,spin:Math.random()*C.TAU,color:colorAt(Math.floor(Math.random()*8)),size:4+Math.random()*5}));
    const start=performance.now();let last=start;
    function animate(now){const dt=Math.min((now-last)/16.7,3);last=now;context.clearRect(0,0,width,height);for(const p of pieces){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=.14*dt;p.spin+=.05*dt;context.save();context.translate(p.x,p.y);context.rotate(p.spin);context.fillStyle=p.color;context.globalAlpha=Math.max(0,1-(now-start)/3200);context.fillRect(-p.size/2,-p.size/2,p.size,p.size*.55);context.restore();}if(now-start<3200)requestAnimationFrame(animate);else context.clearRect(0,0,width,height);}
    requestAnimationFrame(animate);
  }
  $('entries').addEventListener('input',()=>{rotation=0;updateEntries();clearTimeout(saveTimer);saveTimer=setTimeout(persist,250);});
  $('entries').addEventListener('scroll',lineMarkers);
  window.addEventListener('resize',lineMarkers);
  $('spin').addEventListener('click',spin);$('hub-spin').addEventListener('click',spin);
  document.querySelectorAll('.mode').forEach(el=>el.addEventListener('click',()=>setMode(el.dataset.mode)));
  $('tab-entries').addEventListener('click',()=>showEditorTab('entries'));
  $('tab-results').addEventListener('click',()=>showEditorTab('results'));
  // Both segmented controls implement the tab keyboard pattern.
  document.querySelectorAll('[role=tablist]').forEach(list=>list.addEventListener('keydown',event=>{
    const buttons=[...list.querySelectorAll('[role=tab]')].filter(el=>!el.hidden&&!el.disabled);
    let index=buttons.indexOf(document.activeElement);if(index<0)return;
    if(event.key==='ArrowRight')index=(index+1)%buttons.length;else if(event.key==='ArrowLeft')index=(index-1+buttons.length)%buttons.length;else if(event.key==='Home')index=0;else if(event.key==='End')index=buttons.length-1;else return;
    event.preventDefault();buttons[index].click();buttons[index].focus();
  }));
  $('shuffle').addEventListener('click',()=>{$('entries').value=C.shuffled(entries).join('\n');rotation=0;updateEntries();persist();toast('Einmal gut durchgemischt.');});
  $('clear').addEventListener('click',()=>$('confirm-dialog').showModal());
  $('cancel-clear').addEventListener('click',()=>$('confirm-dialog').close());
  $('confirm-clear').addEventListener('click',()=>{$('confirm-dialog').close();$('entries').value='';rotation=0;updateEntries();persist();$('entries').focus();toast('Platz für neue Ideen.');});
  $('save-list').addEventListener('click',()=>{download(showResults?resultText():$('entries').value,showResults?`gluecksrad-${resultMode==='pairs'?'paare':'teams'}.txt`:'gluecksrad-liste.txt');toast(showResults?'Ergebnis als Textdatei gespeichert.':'Liste als Textdatei gespeichert.');});
  $('load-list').addEventListener('click',()=>$('file-input').click());
  $('file-input').addEventListener('change',async event=>{
    const file=event.target.files[0];if(!file)return;
    if(file.size>1024*1024){toast('Bitte wähle eine Textdatei mit höchstens 1 MB.');event.target.value='';return;}
    try {const content=await file.text();if(content.includes('\u0000'))throw new Error('binary');if(busy){toast('Bitte lade die Liste nach der Drehung erneut.');return;}$('entries').value=content.replace(/^\uFEFF/,'').replace(/\r\n|\r/g,'\n');rotation=0;updateEntries();persist();toast(`${entries.length} ${entries.length===1?'Eintrag geladen':'Einträge geladen'}.`);}catch(_){toast('Die Datei konnte nicht gelesen werden. Bitte wähle eine UTF-8-Textdatei.');}finally{event.target.value='';}
  });
  $('clear-history').addEventListener('click',()=>{history=[];renderHistory();persist();toast('Verlauf geleert.');});
  $('open-settings').addEventListener('click',()=>$('settings-dialog').showModal());
  $('settings-done').addEventListener('click',()=>$('settings-dialog').close());
  $('duration').addEventListener('input',e=>{settings.duration=Number(e.target.value);syncSettings();persist();});
  $('speed').addEventListener('input',e=>{settings.speed=Number(e.target.value);syncSettings();persist();});
  for(const [id,key] of [['sound','sound'],['confetti','confetti'],['remove-winner','removeWinner']])$(id).addEventListener('change',e=>{settings[key]=e.target.checked;syncSettings();persist();});
  document.querySelectorAll('[name=palette]').forEach(el=>el.addEventListener('change',()=>{settings.palette=el.value;drawWheel();lineMarkers();persist();}));
  $('reset-settings').addEventListener('click',()=>{settings={...defaults};syncSettings();drawWheel();lineMarkers();persist();toast('Zurück auf Anfang. Einstellungen zurückgesetzt.');});
  $('toggle-sound').addEventListener('click',()=>{settings.sound=!settings.sound;syncSettings();persist();if(settings.sound){initAudio();tone(700,.09,.03);}toast(settings.sound?'Ton ist an.':'Ton ist aus.');});
  $('fullscreen').addEventListener('click',()=>toggleFocus());
  $('close-winner').addEventListener('click',()=>$('winner-dialog').close());
  $('spin-again').addEventListener('click',()=>{$('winner-dialog').close();spin();});
  $('remove-entry').addEventListener('click',()=>removeSelected());
  $('open-privacy').addEventListener('click',()=>$('privacy-dialog').showModal());
  $('close-privacy').addEventListener('click',()=>$('privacy-dialog').close());
  $('team-number').addEventListener('change',()=>{teamCount();invalidateResults();});
  $('teams-minus').addEventListener('click',()=>{$('team-number').value=teamCount()-1;teamCount();invalidateResults();});
  $('teams-plus').addEventListener('click',()=>{$('team-number').value=teamCount()+1;teamCount();invalidateResults();});
  document.addEventListener('keydown',e=>{
    const editing=e.target.closest?.('textarea,input,button,a,select,[contenteditable]');
    if(e.code==='Space'&&!editing&&!document.querySelector('dialog[open]')){e.preventDefault();if(!e.repeat)spin();}
    if(e.key==='Escape'&&document.body.classList.contains('focus-mode'))toggleFocus(false);
  });
  document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const rect=dialog.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)dialog.close();}));
  window.addEventListener('pagehide',persist);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')persist();});
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',e=>{reducedMotion=e.matches;});
  syncSettings();updateEntries(false);setMode(mode);renderHistory();
})();
