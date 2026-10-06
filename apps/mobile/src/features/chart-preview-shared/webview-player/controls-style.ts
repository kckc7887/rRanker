export const PREVIEW_CONTROLS_STYLE = `
body.preview-controls {
  --control-bg:#121212; --control-panel:#1b1b1b; --control-raised:#272727;
  --control-text:#f1f1f1; --control-muted:#a6a6a6; --control-line:#383838;
  --control-accent:var(--preview-accent,#5b8cff); --control-on-accent:var(--preview-on-accent,#000);
  --control-accent-text:var(--preview-accent-text,#8eadff); background:var(--control-bg);
}
html[data-theme="light"] body.preview-controls {
  --control-bg:#f5f5f5; --control-panel:#fff; --control-raised:#ededed;
  --control-text:#202020; --control-muted:#666; --control-line:#d5d5d5;
  --control-accent-text:var(--preview-accent-text,#245cdb);
}
.preview-controls :is(#controls,#header,#info-bar,#fs-overlay) {
  --text:var(--control-text); --muted:var(--control-muted); --border:var(--control-line);
  --accent:var(--control-accent); --playhead:var(--control-text); --playhead-glow:none;
  color:var(--control-text);
}
.preview-controls:not(.fullscreen) #app { overflow:hidden; }
.preview-controls:not(.fullscreen) #header { align-items:center; padding:2px 2px 4px; border:0; }
.preview-controls #title { font-size:15px; font-weight:650; }
.preview-controls :is(#status,#mode-notice,#media-notice) { color:var(--control-muted); }
.preview-controls:not(.fullscreen) #controls {
  padding:12px; gap:10px; border:1px solid var(--control-line); border-top:3px solid var(--control-accent);
  border-radius:16px; background:var(--control-panel); isolation:isolate;
}
.preview-controls #controls :is(button,[tabindex]):focus-visible { outline:2px solid var(--control-accent-text); outline-offset:3px; }
.preview-controls #controls button { font-family:inherit; -webkit-tap-highlight-color:transparent; cursor:pointer; }
.preview-controls #controls button:disabled { cursor:not-allowed; }
.preview-controls:not(.fullscreen) .preview-time-row { justify-content:space-between!important; }
.preview-time-heading { display:flex; align-items:baseline; gap:12px; min-width:0; }
.preview-position-label { color:var(--control-muted); font-size:11px; letter-spacing:.12em; white-space:nowrap; }
.preview-controls:not(.fullscreen) #time-label { font-family:inherit; font-size:13px; line-height:20px; font-weight:600; font-variant-numeric:tabular-nums; white-space:nowrap; color:var(--control-text); }
.preview-measure { display:flex; align-items:baseline; gap:4px; font-size:10px; color:var(--control-muted); white-space:nowrap; }
.preview-controls .preview-measure #timeline-badge { position:static; transform:none; background:transparent; padding:0; font-family:inherit; font-size:13px; line-height:20px; font-weight:600; color:var(--control-text); }
.preview-controls:not(.fullscreen) .preview-timeline-row { margin:-4px 0 2px; }
.preview-controls:not(.fullscreen) .preview-transport { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:7px; align-items:stretch; }
.preview-controls:not(.fullscreen) .transport-side { display:contents; }
.preview-controls:not(.fullscreen) #controls .transport-btn {
  width:100%; height:62px; min-width:0; padding:0; flex-direction:column; gap:5px;
  background:var(--control-raised); border:1px solid transparent; border-radius:10px; color:var(--control-text);
}
.preview-controls:not(.fullscreen) .transport-btn::after { content:attr(data-control-label); font-size:11px; font-weight:500; white-space:nowrap; }
.preview-controls:not(.fullscreen) #controls .transport-btn:hover { border-color:var(--control-line); }
.preview-controls:not(.fullscreen) #controls #btn-step-back { grid-column:1/3; grid-row:1; }
.preview-controls:not(.fullscreen) #controls :is(#play,#play-button) {
  grid-column:3/5; grid-row:1; width:100%; height:62px; min-width:0; border-radius:10px;
  display:flex; flex-direction:column; align-items:center; justify-content:center; gap:5px;
  background:var(--control-accent); color:var(--control-on-accent); box-shadow:none;
}
.preview-controls:not(.fullscreen) :is(#play,#play-button)::after { content:attr(aria-label); font-size:11px; font-weight:500; }
.preview-controls:not(.fullscreen) #controls #btn-step-forward { grid-column:5/7; grid-row:1; }
.preview-controls:not(.fullscreen) #controls #btn-restart { grid-column:1/4; grid-row:2; height:48px; flex-direction:row; }
.preview-controls:not(.fullscreen) #controls #btn-fullscreen { grid-column:4/7; grid-row:2; height:48px; flex-direction:row; }
.preview-controls:not(.fullscreen) .preview-transport.has-measures { grid-template-columns:repeat(12,minmax(0,1fr)); gap:7px 5px; }
.preview-controls:not(.fullscreen) #controls .has-measures #btn-step-back { grid-column:1/5; }
.preview-controls:not(.fullscreen) #controls .has-measures #play { grid-column:5/9; }
.preview-controls:not(.fullscreen) #controls .has-measures #btn-step-forward { grid-column:9/13; }
.preview-controls:not(.fullscreen) #controls .has-measures #btn-restart { grid-column:1/4; height:62px; flex-direction:column; }
.preview-controls:not(.fullscreen) #controls #btn-prev-measure { grid-column:4/7; grid-row:2; }
.preview-controls:not(.fullscreen) #controls #btn-next-measure { grid-column:7/10; grid-row:2; }
.preview-controls:not(.fullscreen) #controls .has-measures #btn-fullscreen { grid-column:10/13; height:62px; flex-direction:column; }
.preview-controls:not(.fullscreen) #controls .loop-row { justify-content:space-between; padding-top:9px; border-top:1px solid var(--control-line); }
.preview-controls:not(.fullscreen) #controls .loop-btn { width:44%; min-height:44px; padding:0 12px; border-radius:10px; font-size:13px; background:var(--control-bg); border-color:var(--control-line); color:var(--control-muted); }
.preview-controls:not(.fullscreen) #controls .loop-btn.on { background:var(--control-raised); color:var(--control-accent-text); border-color:var(--control-accent-text); }
.preview-settings { margin-top:4px; padding-top:14px; border-top:1px solid var(--control-line); min-width:0; }
.preview-settings h2 { margin:0 0 16px; font-size:14px; line-height:20px; font-weight:650; }
.preview-section { margin:0 0 15px; }
.preview-section:last-child { margin:0; }
.preview-section h3 { margin:0 0 8px; color:var(--control-muted); font-size:11px; line-height:18px; font-weight:550; }
.preview-controls #controls .preview-section>.row { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin:0; padding:0; border:0; }
.preview-controls #controls .preview-settings .field { display:block; min-width:0; height:62px; padding:0; border:0; }
.preview-controls #controls .parameter-control {
  display:block; width:100%; min-width:0; height:62px; padding:9px 10px 7px; overflow:hidden;
  border:1px solid var(--control-line); border-radius:11px; background:var(--control-bg); color:var(--control-text);
  cursor:ew-resize; touch-action:pan-y; user-select:none; -webkit-user-select:none; text-align:left;
}
.preview-controls #controls .parameter-control:is(:hover,:focus-visible,.is-dragging) { background:var(--control-raised); border-color:var(--control-accent-text); }
.parameter-head { display:flex; height:21px; align-items:center; justify-content:space-between; gap:6px; }
.parameter-label { font-size:11px; font-weight:500; color:var(--control-muted); }
.parameter-value { font-size:14px; font-weight:650; font-variant-numeric:tabular-nums; white-space:nowrap; }
.parameter-rail { display:block; position:relative; height:18px; margin-top:3px; }
.parameter-ticks { position:absolute; inset:5px 0 2px; background:repeating-linear-gradient(to right,var(--control-line) 0 1px,transparent 1px calc(100% / 16)); border-right:1px solid var(--control-line); }
.parameter-cursor { position:absolute; top:2px; bottom:0; left:clamp(1px,var(--parameter-position,0%),calc(100% - 1px)); width:2px; background:var(--control-accent-text); transform:translateX(-50%); }
.parameter-cursor::before { content:''; position:absolute; width:4px; height:4px; top:-1px; left:-1px; border-radius:1px; background:inherit; }
.parameter-options { display:flex; gap:3px; height:20px; }
.parameter-options span { flex:1; min-width:0; text-align:center; font-size:9px; line-height:18px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--control-muted); border-bottom:2px solid var(--control-line); border-radius:4px; }
.parameter-options .selected { color:var(--control-accent-text); border-color:var(--control-accent-text); background:var(--control-raised); }
.parameter-control[data-enum="true"] .parameter-value { font-size:12px; }
.preview-controls #controls .preview-settings .toggle { width:100%; min-width:0; height:62px; padding:10px; border-radius:11px; background:var(--control-bg); border:1px solid var(--control-line); color:var(--control-muted); font-size:11px; font-weight:500; text-align:left; display:flex; align-items:center; gap:7px; white-space:normal; }
.preview-settings .toggle::before { content:''; width:8px; height:8px; flex:none; border:1px solid currentColor; border-radius:50%; }
.preview-controls #controls .preview-settings .toggle[aria-pressed="true"] { background:var(--control-raised); border-color:var(--control-accent-text); color:var(--control-text); }
.preview-settings .toggle[aria-pressed="true"]::before { background:var(--control-accent); border-color:var(--control-accent-text); }
.preview-controls [hidden] { display:none!important; }
.preview-controls:not(.fullscreen) .preview-details { display:flex; flex-wrap:nowrap; align-items:center; gap:12px; height:28px; min-width:0; overflow-x:auto; overflow-y:hidden; scrollbar-width:thin; color:var(--control-muted); font-size:10px; line-height:20px; }
.preview-controls:not(.fullscreen) .preview-details :is(#info-bar,.info-row) { display:contents; }
.preview-controls:not(.fullscreen) .preview-details .info-item { flex:none; white-space:nowrap; overflow:visible; font-size:10px; }
.preview-details .info-val { color:var(--control-text); font-variant-numeric:tabular-nums; }
.preview-controls:not(.fullscreen) #header { display:flex; justify-content:flex-start; align-items:center; gap:8px; flex:none; min-height:28px; }
.preview-controls:not(.fullscreen) #title { flex:0 1 12em; width:12em; min-width:0; height:24px; line-height:24px; white-space:nowrap; overflow:hidden; text-overflow:clip; }
.preview-controls #title>span { display:inline-block; width:max-content; }
.preview-controls #title.is-scrolling>span { animation:preview-title-scroll var(--title-duration) linear 1s infinite alternate; }
@keyframes preview-title-scroll { from { transform:translateX(0); } to { transform:translateX(var(--title-offset)); } }
.preview-heading-badges { display:flex; flex:none; align-items:center; }
.preview-difficulty { display:flex; white-space:nowrap; border:1px solid; border-radius:999px; padding:3px 9px; font-size:11px; font-weight:700; }
.preview-difficulty-value { font-variant-numeric:tabular-nums; }
.preview-controls:not(.fullscreen) #status { flex:1; min-width:0; width:auto; text-align:right; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:10px; line-height:16px; }
.preview-scroll { flex:1; min-height:0; overflow-y:auto; overscroll-behavior-y:contain; scrollbar-width:thin; }
.preview-controls:not(.fullscreen) :is(#stage-wrap,#canvas-wrap) { flex:none; height:var(--preview-stage-height)!important; min-height:0; width:100%; }
.preview-controls:not(.fullscreen) #stage-wrap .stage { width:min(100%,var(--preview-stage-width)); height:100%; aspect-ratio:auto; }
body.fullscreen .preview-scroll { display:contents; }
body.fullscreen :is(.preview-settings,.preview-time-heading,.preview-details) { display:none!important; }
.preview-controls .heat-timeline { position:relative; height:44px!important; min-height:44px; width:100%; touch-action:none; }
.preview-controls .heat-timeline[data-tracks="2"] { height:106px!important; min-height:106px; }
.preview-controls .heat-timeline :is(#timeline-bars,#fs-timeline-bars) { position:absolute; inset:4px 0 auto; height:auto; overflow:visible; pointer-events:none; }
.heat-track { position:relative; height:18px; }
.heat-timeline[data-tracks="2"] .heat-track { height:46px; padding-top:15px; }
.heat-track-label { position:absolute; top:0; left:0; color:var(--control-muted); font-size:9px; line-height:12px; font-weight:650; }
.heat-strip { position:relative; height:18px; border-bottom:1px solid var(--control-line); }
.heat-layer { position:absolute; inset:0; color:var(--control-muted); }
.heat-layer.played { color:var(--control-accent); clip-path:inset(0 calc(100% - var(--heat-progress,0%)) 0 0); }
.heat-bin { position:absolute; top:0; height:14px; background:currentColor; }
.heat-cursor { position:absolute; left:var(--heat-progress,0%); top:-2px; height:25px; width:2px; transform:translateX(-1px); border-radius:1px; background:var(--control-text); box-shadow:0 0 0 1px var(--control-panel); z-index:5; }
.heat-cursor::before { content:''; position:absolute; top:-2px; left:-2px; width:6px; height:6px; border-radius:2px; background:inherit; box-shadow:0 0 0 2px var(--control-panel); }
.preview-controls .heat-timeline :is(#timeline-ruler,#fs-timeline-ruler) { position:absolute; inset:auto 0 0; height:12px; pointer-events:none; font-size:9px; line-height:12px; font-variant-numeric:tabular-nums; color:var(--control-muted); }
.heat-label { position:absolute; transform:translateX(-50%); white-space:nowrap; }
.heat-label:first-child { transform:none; }
.heat-loop-marker { position:absolute; top:13px; transform:translateX(-50%); width:14px; height:14px; font-size:8px; line-height:12px; text-align:center; background:var(--control-panel); color:var(--control-text); border:1px solid var(--control-text); border-radius:3px; z-index:6; }
.heat-loop-range { position:absolute; top:-2px; height:20px; background:var(--control-raised); border-top:1px solid var(--control-muted); opacity:.55; }
.preview-controls .heat-timeline :is(#timeline-playhead,#fs-timeline-playhead,#timeline-badge,#fs-timeline-badge) { display:none; }
body.preview-controls.fullscreen :is(#controls,#fs-overlay) {
  position:fixed; inset:auto max(12px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));
  width:auto; max-width:760px; margin:0 auto; padding:10px 12px; gap:6px; border:1px solid var(--control-line);
  border-top:3px solid var(--control-accent); border-radius:14px; background:var(--control-panel); box-shadow:none; color:var(--control-text);
}
body.preview-controls.fullscreen #controls { display:grid; }
body.preview-controls.fullscreen:has(#fs-overlay) #controls { display:none; }
body.preview-controls.fullscreen #fs-overlay { display:flex; flex-direction:column; }
body.preview-controls.fullscreen :is(#controls,#fs-overlay).hidden { opacity:0; pointer-events:none; transform:translateY(120%); }
body.preview-controls.fullscreen .transport-group { display:flex; gap:6px; width:100%; align-items:stretch; }
body.preview-controls.fullscreen .transport-side { display:contents; }
body.preview-controls.fullscreen :is(#controls,#fs-overlay) .transport-btn {
  flex:1; width:auto; min-width:0; height:44px; padding:4px; border-radius:9px; border:1px solid var(--control-line);
  background:var(--control-raised); color:var(--control-text); display:flex; flex-direction:column; justify-content:center; align-items:center; gap:2px;
}
body.preview-controls.fullscreen .transport-btn::after { content:attr(aria-label); font-size:10px; line-height:12px; white-space:nowrap; }
body.preview-controls.fullscreen :is(#controls,#fs-overlay) :is(#play,#play-button,#fs-play) { flex:1.3; height:44px; width:auto; border-radius:9px; background:var(--control-accent); color:var(--control-on-accent); box-shadow:none; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; }
body.preview-controls.fullscreen :is(#play,#play-button)::after { content:attr(aria-label); font-size:10px; line-height:12px; }
body.preview-controls.fullscreen :is(#controls,#fs-overlay) .transport-btn svg { width:18px; height:18px; }
.preview-controls :is(#controls,#fs-overlay) .loop-row { display:flex; justify-content:space-between; gap:4px; width:100%; color:var(--control-muted); }
.preview-controls :is(#controls,#fs-overlay) .loop-btn { flex:none; width:44%; min-width:36px; min-height:36px; padding:3px 14px; font-family:monospace; font-size:13px; font-weight:700; border:1px solid var(--control-line); border-radius:10px; background:var(--control-bg); color:var(--control-muted); font-variant-numeric:tabular-nums; cursor:pointer; }
.preview-controls :is(#controls,#fs-overlay) .loop-btn.on { border-color:var(--control-accent-text); color:var(--control-accent-text); background:var(--control-raised); }
.preview-controls .loop-sep { display:inline; margin:0 2px; }
body.preview-controls.fullscreen #fs-lock { top:auto; right:max(12px,env(safe-area-inset-right),calc((100vw - 760px) / 2)); bottom:calc(max(10px,env(safe-area-inset-bottom)) + var(--preview-fullscreen-controls-height,0px) + 16px); left:auto; transform:none; width:48px; height:48px; border-radius:9px; border:1px solid var(--control-line); background:var(--control-panel); color:var(--control-text); flex-direction:column; gap:3px; box-shadow:none; }
body.preview-controls.fullscreen #fs-lock::after { content:attr(aria-label); font-size:10px; line-height:12px; }
body.preview-controls.fullscreen #fs-lock.locked { color:var(--control-on-accent); background:var(--control-accent); border-color:var(--control-accent); }
body.preview-controls.fullscreen :is(#time-label,#fs-time-label) { font-size:12px; font-variant-numeric:tabular-nums; white-space:nowrap; }
@media(max-width:375px) { .preview-controls:not(.fullscreen) #controls { padding:10px; } .parameter-label { font-size:10px; } .parameter-value { font-size:13px; } }
@media(prefers-reduced-motion:reduce) { .preview-controls #controls * { transition:none!important; } }
`;
