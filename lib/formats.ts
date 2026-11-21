/**
 * Trending Reel / TikTok formats ("formatos de tendencia"). Each one is a proven structure the AI
 * follows beat by beat, filling it with the client's content. Used in the AI instructions and in the
 * format picker of the chat.
 */

export interface VideoFormat {
  id: string;
  name: string;
  emoji: string;
  /** one line for the picker */
  hint: string;
  /** when the AI should pick it */
  when: string;
  /** suggested length in seconds */
  length: string;
  /** beat by beat structure */
  beats: string[];
  /** look and pacing */
  style: string;
}

export const FORMATS: VideoFormat[] = [
  {
    id: "pedido",
    name: "Lo único que pidió",
    emoji: "🎙️",
    hint: "Un cliente pide algo «simple» y se va sumando todo lo que hacés",
    when: "servicios, software, agencias, profesionales: mostrar todo lo que resolvés con humor",
    length: "20–30 s",
    beats: [
      "0–3 s: gancho titulo_animado arriba «UN DUEÑO DE [RUBRO] ME MANDÓ ESTE AUDIO DE [N MINUTOS]» + elemento audio debajo (dura todo el video, la onda avanza).",
      "3–22 s: el título cambia a «LO ÚNICO QUE PIDIÓ: [\"ALGO SIMPLE\"]» y queda fijo; a la derecha un contador «N pedidos» que sube de a uno en cada bloque (un contador nuevo por bloque, from N-1 to N). Cada 2–3 s aparece una tarjeta o lista distinta con un pedido concreto (lo que el cliente pidió y vos resolvés). Los subtítulos repiten las frases del audio con «…» al principio.",
      "últimos 6 s: remate titulo_animado «Y SÍ: LO QUERÍA [\"SIMPLE\"]» + lista con todo lo que incluye, y cierre «¿TENÉS UN [RUBRO]?» con botón «COMENTÁ [PALABRA]».",
    ],
    style: "fondo grilla oscuro, acento verde lima o el de la marca, subtítulos viral abajo, pop en cada tarjeta.",
  },
  {
    id: "errores",
    name: "3 errores que…",
    emoji: "❌",
    hint: "Los errores más comunes de tu rubro y cómo evitarlos",
    when: "educar y posicionarse como experto (consultores, coaches, comercios, cursos)",
    length: "25–40 s",
    beats: [
      "0–3 s: titulo_animado «3 ERRORES QUE [TE HACEN PERDER CLIENTES]» + emoji ❌ o 😬.",
      "bloques de 6–9 s por error: titulo_animado arriba «ERROR [#1]» y una tarjeta al medio con el error en pocas palabras (label «ERROR», value corto, sub con la consecuencia); al final del bloque, emoji ✅ y una tarjeta con la solución.",
      "últimos 4 s: cierre «¿CUÁL COMETÍAS VOS?» o el llamado a la acción de la marca.",
    ],
    style: "acento rojo o el de la marca para los errores; whoosh entre errores; zoom en cada «ERROR #».",
  },
  {
    id: "pov",
    name: "POV",
    emoji: "👀",
    hint: "Una situación con la que tu cliente se identifica",
    when: "humor, identificación, mostrar el problema que resolvés de forma liviana",
    length: "10–20 s",
    beats: [
      "0–2 s: titulo_animado «POV: [situación cotidiana del cliente]» grande y arriba.",
      "2–12 s: la escena: 2 o 3 momentos rápidos (cada 2 s algo nuevo: emoji de reacción, tarjeta con un dato, audio de WhatsApp si el problema es un mensaje).",
      "final: giro con la solución (titulo_animado con [palabra clave] en caja) y cierre corto.",
    ],
    style: "ritmo muy rápido, emojis grandes, subtítulos viral, fondo luces o degradado.",
  },
  {
    id: "antes_despues",
    name: "Antes y después",
    emoji: "🔁",
    hint: "La diferencia entre antes y después de tu producto o servicio",
    when: "resultados visibles: estética, reformas, marketing, ventas, software",
    length: "15–25 s",
    beats: [
      "0–3 s: titulo_animado «ANTES vs [DESPUÉS]».",
      "3–9 s: tarjeta «ANTES» con el dato malo (label ANTES, value con el número o situación) + emoji 😩.",
      "9–16 s: whoosh y tarjeta «DESPUÉS» con el dato bueno, contador que sube o barra de progreso hasta el resultado + emoji 🚀.",
      "final: cierre con cómo lograrlo y llamado a la acción.",
    ],
    style: "dos colores (gris para antes, acento para después), flash o barrido en el cambio.",
  },
  {
    id: "secreto",
    name: "Esto no te lo dicen",
    emoji: "🤫",
    hint: "Revelá algo que tu cliente no sabe de tu rubro",
    when: "generar curiosidad y autoridad, datos poco conocidos, tips de experto",
    length: "20–35 s",
    beats: [
      "0–3 s: titulo_animado «LO QUE NADIE TE DICE SOBRE [TEMA]» + emoji 🤫.",
      "3–25 s: 3 revelaciones, cada una con su propio elemento (tarjeta con dato, contador sorprendente, lista corta), una cada 6–8 s; título fijo arriba «SECRETO [#1]», «#2», «#3».",
      "final: «GUARDALO PARA DESPUÉS» o el llamado a la acción.",
    ],
    style: "fondo oscuro, acento llamativo, pausas cortas antes de cada revelación (zoom).",
  },
  {
    id: "pasos",
    name: "Paso a paso",
    emoji: "🪜",
    hint: "Cómo lograr algo en 3 o 4 pasos",
    when: "tutoriales, recetas, tips prácticos, mostrar un proceso",
    length: "20–40 s",
    beats: [
      "0–3 s: titulo_animado «CÓMO [LOGRAR RESULTADO] EN [3 PASOS]».",
      "bloques por paso: titulo_animado arriba «PASO [1]» y una tarjeta o lista con la acción concreta; barra de progreso abajo que avanza (33%, 66%, 100%).",
      "final: el resultado (tarjeta o contador) y cierre «GUARDALO» o el llamado a la acción.",
    ],
    style: "claro y ordenado, mismo lugar para cada paso, pop en cada paso nuevo.",
  },
  {
    id: "testimonio",
    name: "Testimonio",
    emoji: "⭐",
    hint: "Lo que dice un cliente y los resultados que logró",
    when: "prueba social: reseñas, casos de éxito, resultados de clientes",
    length: "15–30 s",
    beats: [
      "0–3 s: titulo_animado con la frase más fuerte del cliente entre comillas, con [palabras clave] en caja.",
      "3–12 s: audio de WhatsApp o tarjeta con el nombre y rubro del cliente + emojis ⭐.",
      "12–22 s: los resultados: contador (ventas, clientes, tiempo ahorrado) y lista con lo que mejoró.",
      "final: «¿QUERÉS LO MISMO?» y el llamado a la acción.",
    ],
    style: "cálido, fondo luces, acento de la marca, subtítulos viral.",
  },
  {
    id: "oferta",
    name: "Oferta / promo",
    emoji: "🏷️",
    hint: "Un descuento o lanzamiento con urgencia",
    when: "promociones, lanzamientos, liquidaciones, cupos limitados",
    length: "10–20 s",
    beats: [
      "0–2 s: titulo_animado con la oferta en caja «[50% OFF] SOLO HOY» + emoji 🔥.",
      "2–8 s: tarjeta del producto con el precio (label PRECIO, value con el precio real, sub con lo que incluye) y lista corta de beneficios.",
      "8–13 s: urgencia: barra de progreso «Cupos vendidos» o contador que baja de unidades.",
      "final: cierre con botón «COMPRÁ AHORA» / «ESCRIBINOS».",
    ],
    style: "ritmo rápido, acento fuerte (rojo, amarillo o el de la marca), pop y ding en el precio. Nunca inventes precios ni descuentos: usa los que dio el cliente o pídelos.",
  },
  {
    id: "mision",
    name: "Misión de videojuego",
    emoji: "🎮",
    hint: "Como si estuvieras dentro de un juego: minimapa, dinero, misión cumplida",
    when: "presentar al equipo o al dueño, el detrás de escena, un pedido o entrega contado como misión, humor de marca",
    length: "15–30 s",
    beats: [
      "todo el video: elemento hud_juego de 0 al final (minimapa, vida, dinero que sube, estrellas; text con el barrio o la zona del negocio) para que parezca que se juega DENTRO del juego; efectos saturacion y contraste suaves en todo el video.",
      "0–3 s: mision solo con label (sin text): indicación arriba a la izquierda «Ve a [el local] y [lo que hay que hacer]» + sonido ding.",
      "3–12 s: presentaciones de personaje: en cada persona o producto (cada 2–3 s) zoom + flash + boom, efecto saturacion y vineta en ese intervalo, y un titulo grande con el NOMBRE abajo a la izquierda + etiqueta con el rol en tono de juego («EL BARBERO», «LA JEFA», «EL QUE NUNCA LLEGA TARDE»).",
      "12–22 s: la misión: mision con text «MISIÓN: [objetivo concreto del cliente]» + lista de objetivos con ✓ que se van tildando, y un contador de dinero o puntos que sube (+$, +XP o +RESPETO; nunca inventes cifras reales del negocio, usa puntos o lo que dé el cliente).",
      "final: mision con text «MISIÓN CUMPLIDA» y sub con la recompensa (+ RESPETO o lo que dé el cliente), sonido tada, las estrellas del hud subiendo si hay persecución + cierre con botón «[LLAMADO A LA ACCIÓN]».",
    ],
    style: "estilo mundo_abierto (Bangers, naranja y verde, saturado), transiciones flash, música energética. Inspirado en videojuegos de acción, sin usar logos, nombres ni personajes de juegos reales.",
  },
];

/** Text for the AI instructions. */
export function formatsForPrompt(): string {
  return FORMATS.map(
    (f) =>
      `### ${f.emoji} ${f.name} (id: ${f.id}) · ${f.length}\nCuándo: ${f.when}.\n${f.beats.map((b) => `- ${b}`).join("\n")}\nEstilo: ${f.style}`,
  ).join("\n\n");
}

export const formatById = (id: string) => FORMATS.find((f) => f.id === id);
