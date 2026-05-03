import { isMandateLost } from "./QishuSystem.js";

const TITLES = [
  { min: 0,   label: "早夭",   blurb: "气数初离，社稷骤倾。" },
  { min: 24,  label: "平庸",   blurb: "守成有余，而无功业可述。" },
  { min: 48,  label: "兴治",   blurb: "郡境渐安，民有所望。" },
  { min: 96,  label: "盛世",   blurb: "百姓乐业，朝野咸称良吏。" },
  { min: 144, label: "雄主",   blurb: "声威远播，史笔将记。" },
  { min: 200, label: "千秋",   blurb: "气数绵长，几近不朽。" }
];

function titleFor(months) {
  let pick = TITLES[0];
  for (const tier of TITLES) if (months >= tier.min) pick = tier;
  return pick;
}

export function evaluateTerm(state, forced = false) {
  if (!forced && !isMandateLost(state)) return null;
  const title = titleFor(state.totalMonthsElapsed);
  state.evaluation = {
    months: state.totalMonthsElapsed,
    year: state.year,
    monthName: state.monthName,
    title: title.label,
    blurb: title.blurb,
    indicators: { ...state.indicators },
    population: state.population,
    qishu: state.qishu,
    archetypeLabel: state.archetypeLabel
  };
  return state.evaluation;
}
