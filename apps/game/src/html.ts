import { serializeProject, type Project } from "@mosaic/model";

export function gameHtml(project: Project, runtime: string) {
  const data = serializeProject(project).replaceAll("<", "\\u003c");
  const script = runtime.replace(/<\/script/gi, "<\\/script");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; worker-src blob:">
<title>Mosaic Game</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#0e101b;color:#f1ebfc;font:14px system-ui;min-height:100dvh;display:grid;grid-template-rows:1fr auto}
#game{width:100%;height:100%;min-width:0;min-height:0;overflow:hidden;display:grid;place-items:center;position:relative}
canvas{width:100%;height:100%;display:block;position:absolute;inset:0;image-rendering:pixelated}
footer{display:flex;align-items:center;gap:1em;padding:.65em 1em;background:#171927;color:#bbb2ce}
button,select{background:#29243d;color:#f1ebfc;border:1px solid #514467;border-radius:5px;padding:.35em .6em}
#runtime-error:not(:empty){color:#ff99a3}
</style>
</head>
<body>
<main id="game" aria-label="Game" tabindex="0"></main>
<footer><strong id="game-title"></strong><label>Renderer <select id="backend"><option value="auto">Auto</option><option value="canvas">Canvas 2D</option><option value="pixi">PixiJS</option></select></label><button type="button" id="enable-audio" hidden>Enable audio</button><span id="runtime-status" role="status"></span><span id="runtime-error" role="alert"></span></footer>
<script id="mosaic-project" type="application/json">${data}</script>
<script>${script}</script>
</body>
</html>`;
}
