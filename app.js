const $ = (selector) => document.querySelector(selector);
const canvas = $('#previewCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const stage = $('#canvasStage');
const cropBox = $('#cropBox');
const shade = $('#cropShade');
const toast = $('#toast');

const defaults = { temperature: 0, tint: 0, vibrance: 0, saturation: 0, clarity: 0, dehaze: 0, black: 0, gamma: 100, white: 255 };
const state = { image: null, fileName: 'cropper', crop: { x: .08, y: .08, w: .84, h: .84 }, ratio: 'free', outputSize: 1000, adjustments: { ...defaults }, drag: null };
const adjustments = [
  ['temperature', 'Temperature', -100, 100], ['tint', 'Tint', -100, 100], ['vibrance', 'Vibrance', -100, 100],
  ['saturation', 'Saturation', -100, 100], ['clarity', 'Clarity', -100, 100], ['dehaze', 'Dehaze', -100, 100]
];

function displayValue(value) { return value > 0 ? `+${value}` : value; }
function createAdjustments() {
  $('#adjustmentList').innerHTML = adjustments.map(([key, label, min, max]) => `<div class="adjustment"><label for="${key}">${label}</label><output id="${key}Value">0</output><input id="${key}" type="range" min="${min}" max="${max}" value="0" /></div>`).join('');
  adjustments.forEach(([key]) => $(`#${key}`).addEventListener('input', ({ target }) => { state.adjustments[key] = +target.value; $(`#${key}Value`).textContent = displayValue(+target.value); render(); }));
}

function sourceRect() { const { image, crop } = state; return { x: crop.x * image.naturalWidth, y: crop.y * image.naturalHeight, w: crop.w * image.naturalWidth, h: crop.h * image.naturalHeight }; }
function getCanvasBounds() { const r = canvas.getBoundingClientRect(); return { x: r.left - stage.getBoundingClientRect().left, y: r.top - stage.getBoundingClientRect().top, w: r.width, h: r.height }; }
function drawImage(targetCtx, outW, outH, useCrop = true) {
  const { image, adjustments: a } = state; const s = useCrop ? sourceRect() : { x: 0, y: 0, w: image.naturalWidth, h: image.naturalHeight };
  targetCtx.clearRect(0, 0, outW, outH);
  targetCtx.filter = `brightness(${1 + (a.dehaze + a.clarity) / 360}) contrast(${1 + (a.clarity + a.dehaze * .4) / 230}) saturate(${1 + (a.saturation + a.vibrance * .55) / 100})`;
  targetCtx.drawImage(image, s.x, s.y, s.w, s.h, 0, 0, outW, outH); targetCtx.filter = 'none';
  if (!Object.values(a).some((v) => v !== 0 && v !== 100 && v !== 255)) return;
  const pixels = targetCtx.getImageData(0, 0, outW, outH); const d = pixels.data; const temp = a.temperature * 1.15, tint = a.tint * .75;
  const black = a.black, white = Math.max(a.white, black + 1), gamma = a.gamma / 100;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] + temp + tint * .35, g = d[i + 1] - tint * .3, b = d[i + 2] - temp;
    r = 255 * Math.pow(Math.max(0, Math.min(1, (r - black) / (white - black))), 1 / gamma);
    g = 255 * Math.pow(Math.max(0, Math.min(1, (g - black) / (white - black))), 1 / gamma);
    b = 255 * Math.pow(Math.max(0, Math.min(1, (b - black) / (white - black))), 1 / gamma);
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  targetCtx.putImageData(pixels, 0, 0);
}
function render() {
  if (!state.image) return;
  const rect = stage.getBoundingClientRect(); const aspect = state.image.naturalWidth / state.image.naturalHeight;
  let w = Math.min(rect.width, rect.height * aspect), h = w / aspect; if (h > rect.height) { h = rect.height; w = h * aspect; }
  const scale = Math.min(1, 1600 / Math.max(state.image.naturalWidth, state.image.naturalHeight));
  canvas.width = Math.max(1, Math.round(state.image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(state.image.naturalHeight * scale));
  canvas.style.width = `${w}px`; canvas.style.height = `${h}px`; drawImage(ctx, canvas.width, canvas.height, false); updateCropUI();
}
function updateCropUI() {
  const b = getCanvasBounds(), c = state.crop; const x = b.x + b.w * c.x, y = b.y + b.h * c.y, w = b.w * c.w, h = b.h * c.h;
  Object.assign(cropBox.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
  Object.assign(shade.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px`, '--x': `${c.x * 100}%`, '--y': `${c.y * 100}%`, '--w': `${c.w * 100}%`, '--h': `${c.h * 100}%` });
}
function ratioNumber() { if (state.ratio === 'free') return null; const [a,b] = state.ratio.split(':').map(Number); return b ? a / b : a; }
function cropSpaceRatio() {
  const ratio = ratioNumber();
  if (!ratio || !state.image) return ratio;
  return ratio / (state.image.naturalWidth / state.image.naturalHeight);
}
function applyRatio(centerX = .5, centerY = .5) {
  const r = cropSpaceRatio(); if (!r) return; const w = Math.min(1, r), h = Math.min(1, 1 / r);
  state.crop = { x: Math.max(0, Math.min(1 - w, centerX - w / 2)), y: Math.max(0, Math.min(1 - h, centerY - h / 2)), w, h };
}
function resetCrop() { const aspect = state.image.naturalWidth / state.image.naturalHeight; state.crop = aspect > 1 ? { x: .08, y: .08, w: .84, h: .84 } : { x: .08, y: .08, w: .84, h: .84 }; applyRatio(); updateCropUI(); }
function setToast(message) { toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2400); }

async function loadFile(file) {
  if (!file || !['image/jpeg','image/png','image/webp'].includes(file.type)) return setToast('Выберите JPEG, PNG или WEBP');
  const url = URL.createObjectURL(file); const img = new Image(); img.onload = () => { state.image = img; state.fileName = file.name.replace(/\.[^/.]+$/, '') || 'cropper'; $('#uploadView').hidden = true; $('#editorView').hidden = false; $('#newPhoto').hidden = false; $('#imageMeta').hidden = false; $('#imageMeta').textContent = `${img.naturalWidth} × ${img.naturalHeight} px`; resetCrop(); requestAnimationFrame(render); URL.revokeObjectURL(url); }; img.src = url;
}
$('#fileInput').addEventListener('change', (e) => loadFile(e.target.files[0]));
['dragenter','dragover'].forEach((name) => $('#dropzone').addEventListener(name, (e) => { e.preventDefault(); $('#dropzone').classList.add('dragging'); }));
['dragleave','drop'].forEach((name) => $('#dropzone').addEventListener(name, (e) => { e.preventDefault(); $('#dropzone').classList.remove('dragging'); }));
$('#dropzone').addEventListener('drop', (e) => loadFile(e.dataTransfer.files[0]));
$('#newPhoto').addEventListener('click', () => { $('#fileInput').value = ''; $('#fileInput').click(); });
$('#ratioGrid').addEventListener('click', (e) => { const button = e.target.closest('button'); if (!button) return; state.ratio = button.dataset.ratio; $$('.ratio').forEach((b) => b.classList.toggle('active', b === button)); applyRatio(state.crop.x + state.crop.w / 2, state.crop.y + state.crop.h / 2); updateCropUI(); });
function $$(s) { return document.querySelectorAll(s); }
$('#resetCrop').addEventListener('click', resetCrop);
$('#cropTab').addEventListener('click', () => { $('#cropTab').classList.add('active'); $('#editTab').classList.remove('active'); $('#cropControls').hidden = false; $('#editControls').hidden = true; });
$('#editTab').addEventListener('click', () => { $('#editTab').classList.add('active'); $('#cropTab').classList.remove('active'); $('#editControls').hidden = false; $('#cropControls').hidden = true; });

function relativePoint(e) { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
function resizeLockedCrop(handle, point, ratio, old) {
  const anchor = {
    nw: { x: old.x + old.w, y: old.y + old.h }, ne: { x: old.x, y: old.y + old.h },
    se: { x: old.x, y: old.y }, sw: { x: old.x + old.w, y: old.y }
  }[handle];
  const horizontal = handle.includes('w') ? anchor.x - point.x : point.x - anchor.x;
  const vertical = handle.includes('n') ? anchor.y - point.y : point.y - anchor.y;
  const requestedWidth = (ratio * ratio * horizontal + ratio * vertical) / (ratio * ratio + 1);
  const maxWidth = {
    nw: Math.min(anchor.x, anchor.y * ratio), ne: Math.min(1 - anchor.x, anchor.y * ratio),
    se: Math.min(1 - anchor.x, (1 - anchor.y) * ratio), sw: Math.min(anchor.x, (1 - anchor.y) * ratio)
  }[handle];
  const width = Math.max(Math.min(.05, maxWidth), Math.min(maxWidth, requestedWidth));
  const height = width / ratio;
  if (handle === 'nw') return { x: anchor.x - width, y: anchor.y - height, w: width, h: height };
  if (handle === 'ne') return { x: anchor.x, y: anchor.y - height, w: width, h: height };
  if (handle === 'se') return { x: anchor.x, y: anchor.y, w: width, h: height };
  return { x: anchor.x - width, y: anchor.y, w: width, h: height };
}
stage.addEventListener('pointerdown', (e) => { if (!state.image || !e.target.closest('.crop-box')) return; const p = relativePoint(e), b = getCanvasBounds(), handle = e.target.dataset.handle; state.drag = { handle, p, crop: { ...state.crop }, b }; stage.setPointerCapture(e.pointerId); });
stage.addEventListener('pointermove', (e) => { if (!state.drag) return; const { p: start, crop: old, b, handle } = state.drag, now = relativePoint(e); const dx = (now.x - start.x) / b.w, dy = (now.y - start.y) / b.h; let c;
  if (!handle) c = { ...old, x: Math.max(0, Math.min(1 - old.w, old.x + dx)), y: Math.max(0, Math.min(1 - old.h, old.y + dy)) };
  else { const ratio = cropSpaceRatio(); if (ratio) c = resizeLockedCrop(handle, { x: (now.x - b.x) / b.w, y: (now.y - b.y) / b.h }, ratio, old); else { let x=old.x,y=old.y,w=old.w,h=old.h; if(handle.includes('e')) w=Math.max(.05,Math.min(1-x,old.w+dx)); if(handle.includes('s')) h=Math.max(.05,Math.min(1-y,old.h+dy)); if(handle.includes('w')) { x=Math.max(0,Math.min(old.x+old.w-.05,old.x+dx)); w=old.w+(old.x-x); } if(handle.includes('n')) { y=Math.max(0,Math.min(old.y+old.h-.05,old.y+dy)); h=old.h+(old.y-y); } c={x,y,w,h}; } } state.crop=c; updateCropUI(); });
stage.addEventListener('pointerup', () => { state.drag = null; });
$('.levels-range').addEventListener('input', () => { state.adjustments.black = +$('#blackPoint').value; state.adjustments.gamma = +$('#gamma').value; state.adjustments.white = +$('#whitePoint').value; if (state.adjustments.white <= state.adjustments.black) $('#whitePoint').value = state.adjustments.white = Math.min(255,state.adjustments.black+1); $('#levelsValue').textContent = `${state.adjustments.black} · ${(state.adjustments.gamma/100).toFixed(2).replace('.', ',')} · ${state.adjustments.white}`; render(); });
$('#resetAdjustments').addEventListener('click', () => { state.adjustments = { ...defaults }; adjustments.forEach(([key]) => { $(`#${key}`).value=0; $(`#${key}Value`).textContent='0'; }); $('#blackPoint').value=0;$('#gamma').value=100;$('#whitePoint').value=255;$('#levelsValue').textContent='0 · 1,00 · 255';render(); });
$$('.size').forEach((button) => button.addEventListener('click', () => { state.outputSize = +button.dataset.size; $$('.size').forEach((b)=>b.classList.toggle('active',b===button)); }));
$('#download').addEventListener('click', () => { if (!state.image) return; const s = sourceRect(), ratio = s.w / s.h; let w = state.outputSize, h = Math.round(w / ratio); if (h > state.outputSize) { h = state.outputSize; w = Math.round(h * ratio); } const out = document.createElement('canvas'); out.width=w;out.height=h;drawImage(out.getContext('2d',{willReadFrequently:true}),w,h); out.toBlob((blob) => { const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${state.fileName}-${state.outputSize}.jpg`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);setToast('JPEG готов к скачиванию'); },'image/jpeg',.92); });
window.addEventListener('resize', () => state.image && render());
createAdjustments();
