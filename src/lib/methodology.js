export const METHODOLOGY = [
  {
    title: "Objetivo",
    items: [
      "Estimar probabilidades (%), no “certezas”. Las cuotas/mercados reales dependen de casas de apuestas, márgenes y noticias.",
      "Usar datos públicos (football-data.org cuando hay token; si no, fallback a TheSportsDB) y construir señales simples, interpretables y reproducibles para apuestas “seguras” (alta prob.) y otras de cuota alta (prob. media/baja).",
    ],
  },
  {
    title: "Ventanas de datos (últimos 10)",
    items: [
      "Para cada equipo se toman hasta los últimos 10 partidos finalizados disponibles en la API.",
      "Si el equipo juega de local: se usa especialmente su ventana de últimos 10 partidos como local (si existen); si juega de visitante: últimos 10 como visitante.",
      "Además se computa un resumen global (últimos 10 sin filtrar) para contexto de forma (W/D/L) y puntos por partido.",
      "Si hay menos de 10 partidos disponibles, se estima con lo que haya (la app reporta el tamaño de muestra).",
    ],
  },
  {
    title: "Zona horaria (Bogotá GMT-5)",
    items: [
      "La selección de fecha y la presentación de horarios se alinean a America/Bogota por defecto.",
      "Esto evita “cambios de día” por usar UTC o la zona del dispositivo al consultar partidos del día.",
    ],
  },
  {
    title: "Modelo de goles (Poisson)",
    items: [
      "Se aproxima la cantidad de goles de cada equipo con Poisson(λ).",
      "λ local se estima combinando: ataque local (goles a favor del local en casa) con defensa visitante (goles en contra del visitante fuera).",
      "λ visitante se estima combinando: ataque visitante (goles a favor fuera) con defensa local (goles en contra en casa).",
      "Se calcula una matriz de marcadores 0–6 por lado; el resto de cola (>6) queda fuera, por eso se normaliza para que sume 1 en ese rango.",
    ],
  },
  {
    title: "Shrinkage (estabilización por pocas muestras)",
    items: [
      "Cuando hay pocos partidos, un promedio simple se distorsiona por rachas cortas.",
      "Se aplica un promedio encogido hacia una media previa de 1.25 goles/partido con peso equivalente a 3 partidos (parámetros editables en el código).",
      "Esto reduce extremos (ej: 0 goles en 2 partidos no implica 0% de anotar).",
    ],
  },
  {
    title: "Mercados y definiciones (cómo se mide cada uno)",
    items: [
      "1X2: Prob(local gana), Prob(empate), Prob(visitante gana) sumando marcadores en la matriz.",
      "Ganador sin empate (Draw No Bet): Normaliza P(ganar) ignorando empates (P(ganar)/(P(ganar)+P(perder))).",
      "Doble oportunidad: 1X, X2, 12 (se suman las combinaciones correspondientes).",
      "Ambos anotan (BTTS): Sí si ambos marcan >=1. Se deriva con P(A>0 y B>0).",
      "Totales (Over/Under): Líneas 0.5/1.5/2.5/3.5/4.5 usando P(goles totales > línea) y P(< línea).",
      "Handicap: Se estima con la diferencia de goles (local - visitante) sobre líneas típicas (-1.5, -1, -0.5, +0.5, +1, +1.5).",
    ],
  },
  {
    title: "Disparos a puerta de jugadores (shots on goal)",
    items: [
      "La API pública actual no expone, de forma consistente, disparos a puerta por jugador para todas las competiciones.",
      "Cuando no hay datos de jugador, el módulo se marca como “No disponible” y no se inventan números.",
    ],
  },
  {
    title: "Interpretación (por qué)",
    items: [
      "La app muestra argumentos basados en: λ estimadas, forma (W/D/L), puntos por partido y tendencias de goles a favor/en contra.",
      "Si standings están disponibles, se agrega contexto de posición y zonas (promoción/relegación) cuando la API las proporciona.",
      "Los resultados deben revisarse con noticias (lesiones, rotaciones, clima). La app prioriza explicabilidad sobre complejidad.",
    ],
  },
];
