# Impulsa Studio — Editor de video con IA

Web para crear contenido: cualquier persona sube sus videos en crudo y le dice a la IA lo que quiere
(“hazlo vertical, quita los silencios, pon subtítulos amarillos, mi logo al inicio y un whoosh en cada corte”).
La IA ejecuta las ediciones en un editor visual donde también se puede ajustar todo a mano.

## Funciones

- **Asistente IA (Claude Haiku, muy económico; se puede cambiar con la variable `CLAUDE_MODEL`)**: entiende instrucciones en lenguaje natural y edita el proyecto llamando a herramientas
  (cortes, subtítulos, textos, fotos, música, sonidos, efectos, formato). Ve el estado del proyecto, las fotos subidas,
  un fotograma del video y, cuando lo necesita, la transcripción con marcas de tiempo.
- **Subtítulos automáticos**: transcripción con Whisper *dentro del navegador* (Transformers.js, WebGPU/WASM).
  Estilos: TikTok, clásico, karaoke, minimal y neón, con palabra activa resaltada. Las líneas se pueden corregir a mano.
- **Cortes**: eliminación automática de silencios (jump cuts), cortar tramos, quedarse con “los mejores momentos”,
  dividir clips (tecla `S`). Todo lo demás (subtítulos, textos, efectos, audio) se reajusta solo.
- **Fotos y textos** superpuestos con animaciones (fundido, pop, deslizar, máquina de escribir); se arrastran en el visor.
- **Música de fondo** (bucle, volumen, fundidos) y **10 efectos de sonido** integrados y sintetizados (sin derechos).
- **Efectos visuales**: zoom, temblor, glitch, flash, fundidos, blanco y negro, sepia, vintage, desenfoque, brillo,
  contraste, saturación, viñeta y barras de cine.
- **Formatos**: 9:16 (Reels/TikTok/Shorts), 16:9, 1:1 y 4:5, con encuadre recortado, con bandas o con fondo desenfocado.
- **Deshacer/rehacer** de cualquier cambio (también los de la IA) y **exportación** a MP4/WebM desde el navegador.

Los archivos del usuario **no se suben a ningún servidor**: el render, el análisis de audio y la transcripción ocurren
en el navegador. Al servidor solo llega el texto de la conversación con la IA, el resumen del proyecto y miniaturas.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # y pon tu ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
```

Requisitos: Node 20+. Navegador recomendado: Chrome o Edge (WebGPU acelera la transcripción; la exportación usa
`MediaRecorder`). La primera transcripción descarga el modelo Whisper elegido (tiny/base/small) desde Hugging Face y
el navegador lo guarda en caché.

## Arquitectura

| Parte | Archivo |
|---|---|
| Modelo de datos del proyecto | `lib/types.ts` |
| Operaciones de edición (ripple delete, subtítulos desde la transcripción…) | `lib/project.ts` |
| Acciones compartidas por la UI y la IA | `lib/actions.ts` |
| Render de cada fotograma (video, efectos, textos, subtítulos) en `<canvas>` | `lib/render.ts` |
| Reproductor, mezcla de audio con WebAudio y exportación | `lib/player.ts` |
| Carga de medios, detección de silencios, transcripción | `lib/media.ts`, `public/whisper-worker.js` |
| Efectos de sonido sintetizados | `lib/sfx.ts` |
| Herramientas y prompt de la IA | `lib/aiTools.ts` |
| Endpoint de la IA (Claude API) | `app/api/assistant/route.ts` |
| Ejecución de las herramientas en el navegador | `lib/aiExecutor.ts`, `components/Chat.tsx` |

El bucle de la IA vive en el cliente: el navegador envía la conversación a `/api/assistant`, que llama a Claude con
las herramientas; las llamadas a herramientas que devuelve Claude se ejecutan en el editor y sus resultados se envían
de vuelta hasta que la IA termina.

## Atajos

`Espacio` reproducir/pausar · `S` dividir clip · `Supr` borrar selección · `←/→` mover un fotograma (`Shift` = 1 s) ·
`Ctrl+Z` / `Ctrl+Shift+Z` deshacer/rehacer.

## Limitaciones actuales

- La exportación es en tiempo real (un video de 1 minuto tarda ~1 minuto) y la pestaña debe estar visible.
- El proyecto vive en memoria: al recargar la página se pierde.
- Los tiempos de cada palabra en los subtítulos se estiman dentro de cada frase de Whisper.
