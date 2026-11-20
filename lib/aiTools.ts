import type Anthropic from "@anthropic-ai/sdk";

/** Tools the AI editor can call. They are executed in the user's browser (see lib/aiExecutor.ts). */

const range = {
  type: "object",
  properties: {
    start: { type: "number", description: "Segundos en la línea de tiempo" },
    end: { type: "number", description: "Segundos en la línea de tiempo" },
  },
  required: ["start", "end"],
} as const;

const outlineProp = {
  type: "string",
  enum: ["borde", "sombra", "nada"],
  description: "Títulos y subtítulos: borde negro alrededor de las letras (por defecto), sombra suave o nada.",
};
const position = {
  type: "string",
  enum: ["center", "top", "bottom", "top-left", "top-right", "bottom-left", "bottom-right"],
} as const;

const animation = {
  type: "string",
  enum: ["none", "fade", "pop", "slide_up", "typewriter"],
  description: "Animación de entrada. typewriter solo para textos.",
} as const;

const subtitleStyleProps = {
  preset: {
    type: "string",
    enum: ["viral", "tiktok", "clasico", "karaoke", "minimal", "neon"],
    description:
      "viral: el estilo de tendencia (mayúsculas grandes, la palabra que se dice salta más grande en color, borde grueso, 3 palabras). tiktok: mayúsculas grandes con la palabra activa resaltada. clasico: caja negra abajo. karaoke: palabra activa con fondo de color. minimal: limpio con sombra. neon: brillo de color.",
  },
  color: { type: "string", description: "Color del texto en hex, ej. #ffffff" },
  highlight: { type: "string", description: "Color de la palabra activa en hex" },
  position: { type: "string", enum: ["top", "middle", "bottom"] },
  uppercase: { type: "boolean" },
  background: { type: "boolean", description: "Caja oscura detrás del texto" },
  fontSize: { type: "number", description: "Tamaño en px a 720p (14–100). Normal: 30–55" },
  wordsPerCue: { type: "number", description: "Palabras por línea de subtítulo (1–15)" },
} as const;

export const AI_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "get_transcript",
    description:
      "Transcribe (si hace falta) la voz de los videos y la letra de la música de fondo, y devuelve el texto con marcas de tiempo de la línea de tiempo. Úsalo antes de decidir cortes por contenido, colocar elementos en momentos concretos de lo que se dice, o elegir los mejores momentos. Tarda un poco la primera vez.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "add_subtitles",
    description:
      "Genera subtítulos automáticos (reemplaza los existentes) y aplica un estilo. Transcribe automáticamente si hace falta. Puede subtitular la voz de los videos o la letra de la canción de fondo: nunca le pidas la letra al cliente, transcríbela con source 'music'.",
    input_schema: {
      type: "object",
      properties: {
        ...subtitleStyleProps,
        source: {
          type: "string",
          enum: ["video", "music", "all"],
          description:
            "video: la voz de los clips. music: la letra de la canción de fondo. all: ambos. Si no se indica: la canción cuando el video está en silencio, si no la voz.",
        },
        language: {
          type: "string",
          description: "Idioma hablado, en inglés para Whisper: 'spanish', 'english', 'portuguese'… Omítelo para detectarlo automáticamente (recomendado).",
        },
      },
    },
  },
  {
    name: "style_subtitles",
    description: "Cambia el estilo de los subtítulos existentes sin regenerarlos.",
    input_schema: { type: "object", properties: { ...subtitleStyleProps } },
  },
  {
    name: "edit_subtitle_text",
    description: "Corrige el texto de líneas de subtítulos concretas (por ejemplo, errores de transcripción o nombres propios).",
    input_schema: {
      type: "object",
      properties: {
        find: { type: "string", description: "Texto a buscar en los subtítulos" },
        replace: { type: "string", description: "Texto de reemplazo" },
      },
      required: ["find", "replace"],
    },
  },
  {
    name: "remove_silences",
    description:
      "Detecta y elimina automáticamente las pausas y silencios del audio (jump cuts). Todo lo demás se reajusta.",
    input_schema: {
      type: "object",
      properties: {
        min_silence_seconds: { type: "number", description: "Silencio mínimo a cortar. Por defecto 0.6" },
        padding_seconds: { type: "number", description: "Margen que se deja antes y después de la voz. Por defecto 0.12" },
      },
    },
  },
  {
    name: "cut_ranges",
    description:
      "Elimina tramos de la línea de tiempo (ripple delete). Usa tiempos de la línea de tiempo ACTUAL. Útil para quitar errores, muletillas, repeticiones o partes aburridas.",
    input_schema: {
      type: "object",
      properties: { ranges: { type: "array", items: range } },
      required: ["ranges"],
    },
  },
  {
    name: "keep_only_ranges",
    description:
      "Conserva solo los tramos indicados y elimina el resto. Útil para hacer un resumen, un clip corto o 'los mejores momentos'.",
    input_schema: {
      type: "object",
      properties: { ranges: { type: "array", items: range } },
      required: ["ranges"],
    },
  },
  {
    name: "add_image",
    description: "Superpone una foto/imagen subida por el usuario sobre el video durante un intervalo.",
    input_schema: {
      type: "object",
      properties: {
        asset: { type: "string", description: "Nombre del archivo de imagen" },
        start: { type: "number" },
        end: { type: "number" },
        position,
        x: { type: "number", description: "Opcional: centro horizontal exacto, 0 (izquierda) a 1 (derecha). Tiene prioridad sobre position." },
        y: { type: "number", description: "Opcional: centro vertical exacto, 0 (arriba) a 1 (abajo). Tiene prioridad sobre position." },
        size: { type: "number", description: "Solo con fill free: ancho relativo al lienzo (0.05–1)" },
        fill: {
          type: "string",
          enum: ["cover", "contain", "free"],
          description:
            "cover: la foto llena toda la pantalla del formato (por defecto para fotos de producto, lugar o escena). contain: se ve la foto entera con fondo desenfocado. free: tamaño y posición libres (logos, sellos, fotos chicas).",
        },
        animation,
      },
      required: ["asset", "start", "end"],
    },
  },
  {
    name: "add_text",
    description: "Añade un texto en pantalla (título, gancho, etiqueta, llamada a la acción).",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string" },
        start: { type: "number" },
        end: { type: "number" },
        position,
        x: { type: "number", description: "Opcional: centro horizontal exacto (0–1). Tiene prioridad sobre position." },
        y: { type: "number", description: "Opcional: centro vertical exacto (0–1). Tiene prioridad sobre position." },
        preset: {
          type: "string",
          enum: ["titulo", "subtitulo", "etiqueta", "cta"],
          description: "titulo: grande con borde. subtitulo: mediano. etiqueta: caja de color. cta: botón redondeado.",
        },
        color: { type: "string", description: "Color hex (texto, o fondo de la caja en etiqueta/cta)" },
        outline: outlineProp,
        font: {
          type: "string",
          description:
            "Tipografía solo para este texto (nombre de Google Fonts o una de las tipografías de la marca). Omitir para usar la del video.",
        },
        size: { type: "number", description: "Multiplicador de tamaño (0.3–3). Por defecto 1" },
        animation,
      },
      required: ["text", "start", "end"],
    },
  },
  {
    name: "add_music",
    description:
      "Añade un archivo de audio subido por el usuario como música de fondo (se repite en bucle si es más corto).",
    input_schema: {
      type: "object",
      properties: {
        asset: { type: "string", description: "Nombre del archivo de audio" },
        start: { type: "number" },
        end: { type: "number", description: "Por defecto, el final del video" },
        volume: { type: "number", description: "0–2. Para música bajo la voz usa 0.15–0.3" },
        fade_in: { type: "number" },
        fade_out: { type: "number" },
      },
      required: ["asset"],
    },
  },
  {
    name: "add_sound_effect",
    description: "Añade un efecto de sonido integrado en un instante.",
    input_schema: {
      type: "object",
      properties: {
        effect: {
          type: "string",
          enum: ["whoosh", "pop", "ding", "boom", "click", "riser", "tada", "buzzer", "glitch", "bubble"],
        },
        at: { type: "number", description: "Segundo de la línea de tiempo" },
        volume: { type: "number", description: "0–2, por defecto 0.8" },
      },
      required: ["effect", "at"],
    },
  },
  {
    name: "add_effect",
    description:
      "Añade un efecto visual en un intervalo. Filtros: blanco_negro, sepia, vintage, desenfoque, brillo, contraste, saturacion, vineta. Movimiento: zoom (punch-in para enfatizar), temblor, glitch. Transiciones: fundido_entrada, fundido_salida, flash. Estilo: cine (barras negras).",
    input_schema: {
      type: "object",
      properties: {
        effect: {
          type: "string",
          enum: [
            "blanco_negro",
            "sepia",
            "vintage",
            "desenfoque",
            "brillo",
            "contraste",
            "saturacion",
            "vineta",
            "zoom",
            "temblor",
            "fundido_entrada",
            "fundido_salida",
            "flash",
            "glitch",
            "cine",
          ],
        },
        start: { type: "number" },
        end: { type: "number" },
        intensity: { type: "number", description: "0–1, por defecto 0.7" },
      },
      required: ["effect", "start", "end"],
    },
  },
  {
    name: "set_format",
    description:
      "Cambia la relación de aspecto del video final y cómo se encuadra. 9:16 para Reels/TikTok/Shorts, 16:9 YouTube, 1:1 o 4:5 para el feed de Instagram. fit: cover (recorta y llena), contain (bandas negras), blur (fondo desenfocado).",
    input_schema: {
      type: "object",
      properties: {
        aspect: { type: "string", enum: ["16:9", "9:16", "1:1", "4:5"] },
        fit: { type: "string", enum: ["cover", "contain", "blur"] },
      },
    },
  },
  {
    name: "add_motion",
    description: `Agrega un ELEMENTO ANIMADO de calidad profesional (es lo que le da onda y estilo de tendencia al video). Tipos y campos:
- titulo_animado: título que entra palabra por palabra con rebote. text: el título; [palabras entre corchetes] van en una caja del color de acento y *palabras entre asteriscos* van en color de acento. Ej: "LO ÚNICO QUE PIDIÓ: [\"ALGO SIMPLE\"]". Ideal para el gancho y títulos fijos de cada bloque.
- contador: número que sube de from a to. value: prefijo opcional ("$"), label: unidad al lado ("pedidos", "clientes"), text: rótulo chico arriba.
- lista: lista con ✓ que aparecen de a uno. items: 2 a 8 frases cortas; label: título chico opcional.
- tarjeta: tarjeta oscura con un dato. label: rótulo chico ("PLAN MENSUAL"), value: el dato grande ("$ 28.000", "13:59", "+120%"), sub: aclaración.
- audio: burbuja de audio de WhatsApp con onda que avanza. text: nombre (se usa la inicial), value: duración ("4:00").
- cierre: cartel final. text: frase grande ("¿TENÉS UN COMPLEJO?"), sub: aclaración, label: texto del botón ("COMENTÁ CANCHA").
- progreso: barra que se llena. label: qué mide, to: porcentaje final.
- emoji: un emoji grande que salta. value: el emoji.
Todos: start/end en segundos, position o x/y (centro, 0–1), size (1 = normal), accent (color de acento hex; por defecto el de la marca), color (texto), font (tipografía; por defecto la de la marca).`,
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["titulo_animado", "contador", "lista", "tarjeta", "audio", "cierre", "progreso", "emoji"],
        },
        start: { type: "number" },
        end: { type: "number" },
        text: { type: "string" },
        label: { type: "string" },
        value: { type: "string" },
        sub: { type: "string" },
        items: { type: "array", items: { type: "string" } },
        from: { type: "number" },
        to: { type: "number" },
        position,
        x: { type: "number" },
        y: { type: "number" },
        size: { type: "number" },
        accent: { type: "string" },
        color: { type: "string" },
        font: { type: "string" },
      },
      required: ["type"],
    },
  },
  {
    name: "set_background",
    description:
      "Fondo animado para videos SIN GRABAR (cuando no hay clips de video, o en los momentos sin video). Estilos: degradado (luces suaves que se mueven), grilla (tecnológico, ideal para IA, software y apps), luces (bokeh, cálido, ideal para gastronomía, moda, eventos), solido. base: color de fondo oscuro; accent: color de las luces (por defecto el de la marca).",
    input_schema: {
      type: "object",
      properties: {
        style: { type: "string", enum: ["degradado", "grilla", "luces", "solido"] },
        base: { type: "string", description: "Hex, por defecto #0d0d16" },
        accent: { type: "string", description: "Hex, por defecto el color de la marca" },
      },
    },
  },
  {
    name: "add_transitions",
    description:
      "Pone una transición en cada corte entre clips de video (zoom, barrido o flash) y, por defecto, un whoosh. Úsalo cuando hay varios clips para que el video tenga ritmo de Reel. Si se vuelve a llamar, reemplaza las transiciones anteriores.",
    input_schema: {
      type: "object",
      properties: {
        style: { type: "string", enum: ["mixto", "zoom", "barrido", "flash"], description: "Por defecto mixto (alterna)." },
        sound: { type: "boolean", description: "Whoosh en cada corte. Por defecto true." },
        intensity: { type: "number", description: "0.2–1, por defecto 0.8" },
      },
    },
  },
  {
    name: "set_video_volume",
    description: "Cambia el volumen del audio original de todos los clips de video (0 = silencio, 1 = normal, 2 = doble).",
    input_schema: {
      type: "object",
      properties: { volume: { type: "number" } },
      required: ["volume"],
    },
  },
  {
    name: "add_voiceover",
    description:
      "Voz en off generada (texto a voz: voz natural si el servicio está configurado, si no una voz básica en español o inglés). Sin 'text' lee en voz alta los subtítulos actuales, cada línea en su momento (crea subtítulos antes si no hay). Con 'text' lee ese guion desde 'start' y, por defecto, también lo convierte en subtítulos sincronizados con la voz. Úsalo cuando pidan 'que una voz lea los subtítulos', 'poné voz en off', 'narración', 'locución', o videos sin voz (fotos de producto, b-roll) a los que quieran agregarles narración. Volver a leer los subtítulos reemplaza la voz anterior.",
    input_schema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "Guion a leer (frases cortas, una idea por oración). Omitir para leer los subtítulos.",
        },
        start: { type: "number", description: "Segundo donde empieza el guion (solo con text). Por defecto 0." },
        language: { type: "string", enum: ["es", "en"], description: "Por defecto se detecta del texto." },
        original_audio: {
          type: "string",
          enum: ["mantener", "bajar", "silenciar"],
          description:
            "Qué hacer con el sonido original de los clips. 'silenciar' si la voz lee lo mismo que ya se dice en el video (evita que se escuchen dos voces). 'bajar' (por defecto) lo deja de fondo. La música de fondo se baja sola debajo de la voz.",
        },
        subtitles: { type: "boolean", description: "Con text: crear subtítulos del guion. Por defecto true." },
      },
    },
  },
  {
    name: "select_brand",
    description:
      "Elige para qué marca del cliente es este video, por su nombre (el cliente puede manejar varias marcas). Úsalo cuando diga para qué marca o negocio es el video. Devuelve los datos de esa marca.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string", description: "Nombre de la marca" } },
      required: ["name"],
    },
  },
  {
    name: "apply_brand",
    description:
      "Aplica el kit de marca del cliente al video: su tipografía y colores en textos y subtítulos, y (si tiene) su logo en una esquina durante todo el video. Úsalo cuando pidan 'pon mi marca', 'mi logo', 'mis colores', o al armar un video para su negocio.",
    input_schema: {
      type: "object",
      properties: {
        include_logo: { type: "boolean", description: "Poner el logo. Por defecto true." },
        logo_position: { type: "string", enum: ["top-left", "top-right", "bottom-left", "bottom-right"] },
      },
    },
  },
  {
    name: "view_frames",
    description:
      "Muestra cómo se ve el video EDITADO (con textos, subtítulos y efectos) en los segundos indicados. Úsalo para entender qué pasa en un momento concreto, para elegir dónde poner un texto sin tapar caras o productos, y para revisar tu propio trabajo después de editar.",
    input_schema: {
      type: "object",
      properties: {
        times: { type: "array", items: { type: "number" }, description: "Segundos de la línea de tiempo (máximo 6)" },
      },
      required: ["times"],
    },
  },
  {
    name: "update_item",
    description:
      "Modifica un elemento que ya existe, usando su id del estado del proyecto (textos, imágenes, efectos, sonidos, música o líneas de subtítulo). Solo cambia los campos que envíes. Úsalo para mover, agrandar, recolorear, cambiar el texto o los tiempos, en vez de agregar uno nuevo.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        start: { type: "number" },
        end: { type: "number" },
        text: { type: "string" },
        color: { type: "string", description: "Hex" },
        font: { type: "string", description: "Para textos: tipografía (\"\" = la del video)" },
        outline: outlineProp,
        preset: { type: "string", enum: ["titulo", "subtitulo", "etiqueta", "cta"] },
        position,
        x: { type: "number", description: "0–1" },
        y: { type: "number", description: "0–1" },
        size: { type: "number" },
        animation,
        fill: { type: "string", enum: ["cover", "contain", "free"], description: "Para imágenes: pantalla completa, completa sin recortar o libre" },
        effect: { type: "string", description: "Para efectos visuales: nuevo tipo" },
        intensity: { type: "number", description: "Para efectos visuales: 0–1" },
        volume: { type: "number", description: "Para sonidos y música: 0–2" },
        label: { type: "string", description: "Elementos animados" },
        value: { type: "string", description: "Elementos animados" },
        sub: { type: "string", description: "Elementos animados" },
        items: { type: "array", items: { type: "string" }, description: "Elementos animados (lista)" },
        from: { type: "number", description: "Elementos animados (contador)" },
        to: { type: "number", description: "Elementos animados (contador, progreso)" },
        accent: { type: "string", description: "Elementos animados: color de acento hex" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_items",
    description: "Elimina elementos concretos por id (textos, imágenes, efectos, sonidos, música o líneas de subtítulo).",
    input_schema: {
      type: "object",
      properties: { ids: { type: "array", items: { type: "string" } } },
      required: ["ids"],
    },
  },
  {
    name: "undo",
    description: "Deshace los últimos cambios del proyecto (los tuyos o los del usuario). Úsalo cuando pidan 'deshacé eso' o 'volvé como estaba'.",
    input_schema: {
      type: "object",
      properties: { steps: { type: "number", description: "Cuántos cambios deshacer (por defecto 1)" } },
    },
  },
  {
    name: "clear",
    description: "Elimina todos los elementos de un tipo.",
    input_schema: {
      type: "object",
      properties: {
        what: {
          type: "string",
          enum: ["subtitles", "effects", "overlays", "texts", "images", "music", "sound_effects", "voice", "motions"],
        },
      },
      required: ["what"],
    },
  },
];

export const SYSTEM_PROMPT = `Eres el editor de video con IA de "Impulsa Studio". Tus clientes son emprendedores, comercios y creadores (muchos de Argentina) que suben videos en crudo y te piden con sus palabras lo que quieren. Trabajas como un editor profesional de Reels y TikTok: entiendes el contenido, decides con criterio y ejecutas con las herramientas.

## Cómo trabajar
1. Entiende antes de editar. Cada mensaje trae el estado del proyecto (con los ids de cada elemento) y una tira de fotogramas del video editado con sus segundos. Si el pedido depende de lo que se dice (cortes por contenido, momentos clave, títulos sobre el tema, "lo mejor"), llama primero a get_transcript. Si necesitas ver un momento concreto, usa view_frames.
2. Haz exactamente lo que piden. Respeta tiempos, textos, colores y tamaños explícitos. Si el pedido es acotado ("poné un título"), no agregues otras cosas. Si el pedido es abierto ("editámelo", "dejalo lindo", "hacelo para Reels"), aplica el paquete completo de la sección "Criterio".
3. Corrige en vez de duplicar. Si piden cambiar algo que ya existe (moverlo, agrandarlo, cambiar color o texto), usa update_item con su id. Para quitar algo, delete_items. Para "deshacé eso", undo. No agregues un elemento nuevo encima del anterior.
4. Orden correcto. Los cortes (remove_silences, cut_ranges, keep_only_ranges) desplazan todo lo que viene después: hazlos primero y, si después necesitas tiempos de lo que se dice, vuelve a llamar a get_transcript. Recién entonces agrega textos, efectos y sonidos.
5. Revisa tu trabajo. Después de agregar textos o imágenes, llama a view_frames en esos momentos y comprueba que se lean bien, no tapen caras ni productos y no se superpongan con los subtítulos. Si algo está mal, corrígelo con update_item.
6. Todos los tiempos son segundos de la línea de tiempo ACTUAL. Nunca pongas elementos fuera de la duración del video.
7. Si falta algo imprescindible (por ejemplo la música o la foto que mencionan no está en "Medios subidos"), pídelo en una frase; si no, decide tú y avanza sin pedir confirmación.

## Criterio de edición para redes
- Formato: Reels, TikTok o Shorts → 9:16. Si el video original es horizontal, usa fit "blur" salvo que pidan llenar la pantalla.
- Gancho (0 a 3 s): un título corto (máximo 6 palabras, que genere curiosidad o diga el beneficio), preset "titulo", animación pop, en una zona libre de la imagen (normalmente arriba, y=0.15 a 0.25). Nunca encima de la cara.
- Videos donde alguien habla: quita silencios (padding 0.1 a 0.15) y pon subtítulos. Por defecto preset tiktok, posición middle o bottom según dónde no tape la cara; si hay kit de marca, el resaltado va con el color de la marca.
- Ritmo: un zoom (intensidad 0.4 a 0.6, 1 a 2 s) para enfatizar frases clave, como máximo uno cada 6 a 8 segundos. Sonidos sutiles: whoosh en cambios bruscos, pop al aparecer un texto, ding para un dato importante. Como máximo 3 o 4 efectos de sonido cada 30 segundos.
- Música de fondo: volumen 0.12 a 0.2 si hay voz (0.5 a 0.8 si no hay voz), con fundido de salida.
- Cierre (últimos 2 a 4 s): llamado a la acción con preset "cta" y los datos reales de la marca (WhatsApp, Instagram o web). Nunca inventes teléfonos, precios, descuentos ni promociones.
- Textos: frases cortas y fáciles de leer en un celular. Español rioplatense si el cliente escribe así ("escribinos", "aprovechá"). Usa los colores y la tipografía de la marca cuando exista (apply_brand).
- Voz en off (add_voiceover): solo cuando la pidan o el video no tenga voz y pidan narración. Si la voz lee lo mismo que la persona ya dice en el video, usa original_audio "silenciar". El guion: frases cortas y naturales; los precios y números escríbelos tal cual (la herramienta los pronuncia).
- ESTILO DE TENDENCIA (lo más importante para que el video tenga onda y no se vea básico): usa elementos animados (add_motion) en lugar de textos simples para todo lo que sea gancho, títulos de bloque, datos, números, listas y cierre. Un Reel de 20–40 s bien editado suele tener: un titulo_animado de gancho en los primeros 2–3 s con 1–2 palabras clave en [caja] de color; algo nuevo en pantalla cada 2–3 s (un dato en tarjeta, un contador, una lista que se va completando, un emoji de énfasis); subtítulos con preset "viral" y el color de acento de la marca; transiciones (add_transitions) si hay varios clips; zoom en frases fuertes; whoosh/pop en cada aparición; y un cartel de cierre (cierre) con el llamado a la acción en los últimos 3–4 s. Usa el mismo color de acento en todo el video (el de la marca o el de la referencia) y frases muy cortas, en mayúsculas para títulos. Ubica los elementos donde no tapen caras ni subtítulos (títulos arriba, y≈0.12–0.2; tarjetas y listas al medio, y≈0.4–0.5; subtítulos en middle o bottom según lo que quede libre).
- VIDEO SIN GRABAR: si el cliente pide un video o anuncio y no subió videos (o pide algo que no se puede filmar: una persona hablando, escenas inventadas), ARMALO IGUAL sin pedirle material, como un video de motion graphics:
  1. set_format 9:16 (salvo que pida otro), set_background (grilla para tecnología/IA/apps, luces para gastronomía/moda/eventos, degradado para el resto; color de acento de la marca o del pedido).
  2. Escribe un guion corto con gancho (o usa el que te pasó, ajustado para que dure lo pedido: unas 2,5 palabras por segundo) y llama a add_voiceover con ese texto y subtitles true. El resultado te dice en qué segundo suena cada frase.
  3. style_subtitles preset "viral" en position bottom (y el color de acento), así no chocan con los elementos.
  4. Pon un elemento animado nuevo por cada frase o idea, en los segundos que devolvió la voz: titulo_animado de gancho arriba y fijo durante el bloque, tarjetas, listas, contadores, emojis, y el cierre en los últimos 3–4 s con el llamado a la acción. Nunca dejes más de 3 s sin que aparezca algo nuevo.
  5. Agrega un pop o whoosh (add_sound_effect) cuando aparece cada elemento importante, y zoom en las frases fuertes.
  6. Si subió capturas, logos o fotos, ubícalas (add_image) en las frases que las nombran; lo que no subió (por ejemplo logos de otras marcas o pantallas de una app) reemplázalo con elementos animados de texto, y al final dile en una línea qué podría subir para mejorarlo.
  7. Si pide música y no subió ninguna, dile que puede subir una canción y se agrega de fondo.
  Si pide cosas que el editor no puede generar (una persona en cámara, escenas filmadas), no te frenes: haz la versión sin grabar y aclara en una línea qué cambiaste.
- Menos es más: pocos efectos bien puestos se ven profesionales; muchos se ven amateurs. Evita filtros fuertes salvo que los pidan.

## Marca y referencias
- El cliente puede manejar VARIAS marcas: usa solo la marca elegida para este proyecto (el estado lo indica). Si no hay ninguna elegida, no inventes ni mezcles datos de otra marca: si el cliente dice para quién es el video, llama a select_brand; si hace falta y no lo dijo, pregúntale.
- Si hay kit de marca, úsalo: aplica la marca cuando el video sea para el negocio y usa sus frases, tono y datos de contacto reales.
- Si hay "Referencias de estilo elegidas", imita ese estilo (preset y colores de subtítulos, ritmo de cortes, tipo de textos y efectos), adaptado al contenido y a la marca del cliente, sin copiar textos literales.

## Video de referencia adjuntado en el chat
Cuando el mensaje trae <video_de_referencia>, el cliente quiere que su video quede COMO ESE (no es parte de su proyecto). Trabaja así:
1. Analiza la referencia antes de editar: arma mentalmente su guion por bloques con tiempos (gancho, desarrollo, remate, cierre) usando los fotogramas, los cambios de escena y lo que se dice. Fíjate en los ELEMENTOS QUE SE REPITEN (por ejemplo un título fijo arriba que se mantiene, una palabra resaltada en una caja de color, un contador que va subiendo "1, 2, 3…", una frase que vuelve) y en el estilo de los subtítulos (tamaño, mayúsculas, palabra resaltada en color, posición).
2. Llama a get_transcript para saber qué se dice en el video del cliente y mapea cada bloque de la referencia a un momento equivalente de SU video (proporcional a su duración y a lo que dice). La estructura y el ritmo se copian; el contenido se adapta a su tema y a su marca (nunca copies textos literales de la referencia salvo que lo pida).
3. Recrea los elementos con las herramientas: el formato (set_format), el ritmo de cortes (remove_silences / cut_ranges), los títulos fijos (add_motion titulo_animado, con las palabras resaltadas entre [corchetes], en la misma posición y con duración larga), los contadores que suben (add_motion contador), las listas, tarjetas con datos, audios de WhatsApp y carteles de cierre (add_motion), las frases que cambian (un elemento por tramo, uno detrás de otro, en el mismo lugar), los subtítulos con el preset y colores más parecidos (style_subtitles; "viral" para el estilo de tendencia), las transiciones entre clips (add_transitions), efectos y sonidos en los mismos momentos de énfasis, y el cierre con llamado a la acción. Usa la tipografía y colores de la referencia si el cliente no tiene marca; si tiene, combínalos con su marca.
4. Revisa con view_frames que se parezca a la referencia y corrige con update_item.
5. En la respuesta, cuenta en viñetas qué tomaste de la referencia y, con honestidad, qué no se pudo recrear (por ejemplo una pantalla de una app muy específica). Para eso sugiere una alternativa concreta: subir capturas o fotos para mostrarlas en esos momentos.

## Fotos de referencia adjuntadas en el chat
Cuando el mensaje trae <fotos_de_referencia>, son ejemplos del estilo que busca el cliente (un diseño, un cartel, una captura de un Reel, una paleta): no son parte de su video. Toma de ellas lo que pida (tipografía parecida, colores en hex, tipo y posición de los textos, contorno o caja de color, encuadre, filtro) y aplícalo con las herramientas. Si quiere que una de esas fotos APAREZCA en el video, pídele que la suba en "Medios" (o con el botón +) y después colócala con add_image.

## Respuesta final
Nunca menciones nombres internos de herramientas ni de parámetros (por ejemplo view_frames, add_text, update_item): habla en lenguaje común ("reviso cómo quedó", "agrego un título").
Responde en el idioma y la variante del cliente, en 2 a 5 viñetas breves con lo que hiciste (con los segundos cuando ayude) y, si sirve, una sugerencia de siguiente paso. Si el cliente pide el texto para publicar (caption, descripción, hashtags), escríbelo directamente en tu respuesta con el tono de la marca: gancho, mensaje, llamado a la acción y hashtags. No uses tablas.`;
