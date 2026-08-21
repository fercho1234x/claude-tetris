# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es esto

Tetris clásico en JavaScript vanilla (sin dependencias, sin framework, sin build). Tres archivos: `index.html`, `style.css`, `game.js`. Todo el juego cabe en `game.js` (~300 líneas).

## Ejecutar / probar cambios

No hay build ni tests. Para ver el juego funcionando, abrir `index.html` directamente en el navegador o servir el directorio:

```bash
python3 -m http.server 8000   # o: npx serve .
```

No existe `package.json`; no añadir uno ni un bundler salvo que el usuario lo pida explícitamente — el proyecto está pensado para abrirse sin instalación.

## Arquitectura

Todo el estado del juego vive en variables globales de módulo en `game.js` (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, ...). No hay clases ni módulos ES; es un único script cargado con `<script src="game.js">`.

Piezas clave a entender antes de tocar la lógica de juego:

- **Tablero**: matriz `ROWS × COLS` (20×10); cada celda es `0` (vacía) o un índice 1–7 que indexa `COLORS`/`PIECES` (el color/tipo de la pieza que la ocupó).
- **Piezas**: matrices cuadradas fijas en `PIECES`. Rotación (`rotateCW`) = transposición, sin tablas de rotación tipo SRS.
- **Colisión** (`collide`): única fuente de verdad para saber si una forma cabe en `(ox, oy)`; todo movimiento/rotación/gravedad pasa por aquí.
- **Wall kicks** (`tryRotate`): tras rotar, prueba desplazamientos `[0, -1, 1, -2, 2]` columnas hasta encontrar uno sin colisión.
- **Loop de juego** (`loop`, via `requestAnimationFrame`): acumula `dt` y baja la pieza cuando supera `dropInterval`; `dropInterval` se recalcula en `clearLines` según el nivel vía `dropIntervalForLevel(level)` (`max(100, 1000 - (level-1)*90)`), la misma función que usa `init()` al arrancar.
- **Fijar pieza** (`lockPiece`): `merge()` la escribe en `board` → `clearLines()` → `spawn()` la siguiente. Si la nueva pieza ya colisiona al aparecer, `endGame()`.
- **Rendering**: `draw()` redibuja todo el canvas cada frame (grid + tablero + ghost piece con `globalAlpha=0.2` + pieza activa); `drawNext()` dibuja el preview en un canvas aparte.
- **Input**: un único listener `keydown` en `document` despacha por `e.code`; `P` y `Escape` alternan pausa (`togglePause`) incluso durante game over check (early return si `gameOver`); mientras `paused` es true el resto de teclas de juego hace early-return antes del `switch`.
- **Menú de pausa** (`#pause-overlay` en `index.html`): `togglePause()` muestra/oculta el menú (`showPauseMenu`/`hidePauseMenu`) en vez del antiguo overlay de texto plano. El menú tiene dos sub-vistas conmutadas por `showPauseView('main' | 'controls')`: la principal (Reanudar, Reiniciar, Ver controles, selector de nivel inicial) y la de controles, cuyo `<ul>` se clona en runtime desde `.controls` (no se duplica el marcado a mano). El nivel inicial elegido se guarda en `localStorage` bajo `tetris-start-level` (1–15, `getStartLevel()`); `init()` lo guarda en `startLevel` y lo aplica a `level`/`dropInterval`. `clearLines()` calcula el nivel como `startLevel + Math.floor(lines/10)` (no desde 1), para que subir de nivel no pise el nivel inicial elegido.

Al modificar `COLS`, `ROWS` o `BLOCK` en `game.js`, hay que actualizar también `width`/`height` del `<canvas id="board">` en `index.html` para que coincidan (`COLS × BLOCK`, `ROWS × BLOCK`).
