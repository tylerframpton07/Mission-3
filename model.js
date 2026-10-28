export const STORAGE_KEY = "mission3-pricing-laboratory-v1";
export const SCENARIO_PRESETS = [
  { id: "lean", name: "Lean startup", units: 18, fixedScale: 0.65, note: "Small test launch; lower fixed spend. Volume is a separate assumption." },
  { id: "typical", name: "Typical operation", units: 40, fixedScale: 1, note: "Working reference case; not a verified forecast." },
  { id: "expansion", name: "Expansion", units: 85, fixedScale: 1.8, note: "More capacity and overhead; sales volume is not assumed to rise with spend." }
];

export const deepCopy = value => JSON.parse(JSON.stringify(value));

function buildScenarioValues(profile, preset) {
  const expenseAmounts = {};
  for (const expense of profile.expenses) {
    const isRecurringFixed = expense.timing === "recurring" && expense.classification === "fixed";
    expenseAmounts[expense.id] = isRecurringFixed ? round2(expense.amount * preset.fixedScale) : expense.amount;
  }
  const baseUnits = profile.products.reduce((sum,p)=>sum+(Number(p.salesPerMonth)||0),0) || 1;
  const productUnits = {};
  let assigned = 0;
  profile.products.forEach((p,i)=>{
    const value = i === profile.products.length - 1 ? preset.units - assigned : Math.round(preset.units * (Number(p.salesPerMonth)||0) / baseUnits);
    productUnits[p.id] = Math.max(0,value); assigned += Math.max(0,value);
  });
  return { id: preset.id, name: preset.name, units: preset.units, expenseAmounts, productUnits, custom: false, note: preset.note };
}

export function createInitialState(config, ventureId = "nara-tee") {
  const profile = config.profiles[ventureId] || config.profiles["nara-tee"];
  const baseUnits = profile.products.reduce((sum, p) => sum + (Number(p.salesPerMonth) || 0), 0) || 40;
  const presets = SCENARIO_PRESETS.map(preset => ({
    ...preset,
    units: preset.id === "lean" ? Math.max(1, Math.round(baseUnits * 0.5)) : preset.id === "expansion" ? Math.round(baseUnits * 2) : baseUnits
  }));
  const scenarios = Object.fromEntries(presets.map(preset => [preset.id, buildScenarioValues(profile, preset)]));
  const typical = scenarios.typical;
  const state = {
    version: 1,
    ventureId: profile.id,
    contextAcknowledged: false,
    products: deepCopy(profile.products),
    expenses: deepCopy(profile.expenses),
    currentScenarioId: "typical",
    scenarios,
    activeCostCategory: "All costs",
    chartRange: 250,
    evaluation: null,
    confirmation: null
  };
  applyScenario(state, typical.id);
  return state;
}

export function applyScenario(state, scenarioId) {
  const scenario = state.scenarios[scenarioId];
  if (!scenario) return state;
  state.currentScenarioId = scenarioId;
  for (const expense of state.expenses) {
    if (Object.hasOwn(scenario.expenseAmounts, expense.id)) expense.amount = scenario.expenseAmounts[expense.id];
  }
  for (const product of state.products) product.salesPerMonth = scenario.productUnits?.[product.id] ?? scenario.units;
  return state;
}

export function saveCurrentScenarioValues(state) {
  const scenario = state.scenarios[state.currentScenarioId];
  if (!scenario) return;
  scenario.expenseAmounts = Object.fromEntries(state.expenses.map(e => [e.id, Number(e.amount) || 0]));
  scenario.productUnits = Object.fromEntries(state.products.map(p => [p.id, Math.max(0, Number(p.salesPerMonth) || 0)]));
  scenario.units = state.products.reduce((sum, p) => sum + Math.max(0, Number(p.salesPerMonth) || 0), 0);
}

export function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function monthsInFrequency(frequency) {
  if (frequency === "weekly") return 52 / 12;
  if (frequency === "quarterly") return 1 / 3;
  if (frequency === "annual") return 12;
  return 1;
}

function monthlyRecurringAmount(amount, frequency) {
  const value = Number(amount || 0);
  if (frequency === "weekly") return value * 52 / 12;
  if (frequency === "quarterly") return value / 3;
  if (frequency === "annual") return value / 12;
  return value;
}

export function annualizedAmount(expense) {
  if (!expense.enabled || expense.timing !== "recurring") return 0;
  if (expense.frequency === "perUnit" || expense.frequency === "oneTime") return 0;
  if (expense.classification === "variable") return 0;
  return round2(monthlyRecurringAmount(expense.amount, expense.frequency) * 12);
}

export function calculateModel(state) {
  const expenses = state.expenses.filter(e => e.enabled);
  const products = state.products.map(p => ({ ...p, price: Math.max(0, Number(p.price) || 0), salesPerMonth: Math.max(0, Number(p.salesPerMonth) || 0) }));
  const fixedBreakdown = expenses.filter(e => e.timing === "recurring" && e.classification === "fixed").map(e => ({ expense: e, monthly: monthlyRecurringAmount(e.amount, e.frequency) }));
  const depreciationBreakdown = expenses.filter(e => e.timing === "startup" && Number(e.depreciationMonths) > 0).map(e => ({ expense: e, monthly: Number(e.amount || 0) / Number(e.depreciationMonths) }));
  const fixedMonthly = round2(fixedBreakdown.reduce((sum, row) => sum + row.monthly, 0) + depreciationBreakdown.reduce((sum, row) => sum + row.monthly, 0));
  const startupCash = round2(expenses.filter(e => e.timing === "startup").reduce((sum, e) => sum + Number(e.amount || 0), 0));

  const productRows = products.map(product => {
    const periodMonths = product.period === "annual" ? 12 : 1;
    const monthlyPricePerUnit = product.price / periodMonths;
    const unitCosts = [];
    for (const expense of expenses) {
      if (expense.timing !== "recurring" || expense.classification !== "variable") continue;
      if (expense.allocation === "product" && !expense.productIds?.includes(product.id)) continue;
      let monthlyCost = 0;
      const amount = Math.max(0, Number(expense.amount) || 0);
      if (expense.amountMode === "percent") {
        monthlyCost = monthlyPricePerUnit * amount / 100;
      } else if (expense.frequency === "perUnit" || expense.frequency === "oneTime") {
        monthlyCost = amount / periodMonths;
      } else {
        // Variable service costs may accrue per active product per month.
        monthlyCost = monthlyRecurringAmount(amount, expense.frequency);
      }
      unitCosts.push({ expense, monthly: monthlyCost });
    }
    const variablePerUnit = round2(unitCosts.reduce((sum, row) => sum + row.monthly, 0));
    const contributionPerUnit = round2(monthlyPricePerUnit - variablePerUnit);
    const monthlyRevenue = round2(monthlyPricePerUnit * product.salesPerMonth);
    const monthlyVariable = round2(variablePerUnit * product.salesPerMonth);
    const productFixed = fixedBreakdown.filter(row => row.expense.allocation === "product" && row.expense.productIds?.includes(product.id)).reduce((sum, row) => sum + row.monthly, 0)
      + depreciationBreakdown.filter(row => row.expense.allocation === "product" && row.expense.productIds?.includes(product.id)).reduce((sum, row) => sum + row.monthly, 0);
    return { ...product, periodMonths, monthlyPricePerUnit: round2(monthlyPricePerUnit), unitCosts, variablePerUnit, contributionPerUnit, contributionPercent: monthlyPricePerUnit > 0 ? contributionPerUnit / monthlyPricePerUnit : 0, monthlyRevenue, monthlyVariable, productFixed: round2(productFixed), monthlyContribution: round2((contributionPerUnit * product.salesPerMonth)) };
  });

  const revenue = round2(productRows.reduce((sum, p) => sum + p.monthlyRevenue, 0));
  const variable = round2(productRows.reduce((sum, p) => sum + p.monthlyVariable, 0));
  const totalUnits = productRows.reduce((sum, p) => sum + p.salesPerMonth, 0);
  const totalContribution = round2(productRows.reduce((sum, p) => sum + p.monthlyContribution, 0));
  const weightedContribution = totalUnits > 0 ? totalContribution / totalUnits : productRows.length ? productRows.reduce((sum, p) => sum + p.contributionPerUnit, 0) / productRows.length : 0;
  const weightedMonthlyPrice = totalUnits > 0 ? revenue / totalUnits : productRows.length ? productRows.reduce((sum, p) => sum + p.monthlyPricePerUnit, 0) / productRows.length : 0;
  const breakEvenUnits = weightedContribution > 0 ? Math.ceil(fixedMonthly / weightedContribution) : null;
  const breakEvenRevenue = breakEvenUnits == null ? null : round2(breakEvenUnits * weightedMonthlyPrice);
  const operatingProfit = round2(revenue - variable - fixedMonthly);
  const marginSafetyUnits = breakEvenUnits == null ? null : totalUnits - breakEvenUnits;
  const marginSafetyPercent = breakEvenUnits == null || totalUnits <= 0 ? null : (totalUnits - breakEvenUnits) / totalUnits;

  const expenseByCategory = {};
  for (const e of expenses) {
    if (e.timing !== "recurring") continue;
    const category = e.category || "Other";
    let amount = 0;
    if (e.classification === "fixed") amount = monthlyRecurringAmount(e.amount, e.frequency);
    else {
      const applicable = productRows.filter(p => e.allocation !== "product" || !e.productIds?.length || e.productIds.includes(p.id));
      amount = applicable.reduce((sum, p) => {
        if (e.amountMode === "percent") return sum + p.monthlyRevenue * Number(e.amount || 0) / 100;
        if (e.frequency === "perUnit" || e.frequency === "oneTime") return sum + (Number(e.amount || 0) / p.periodMonths) * p.salesPerMonth;
        return sum + monthlyRecurringAmount(e.amount, e.frequency) * p.salesPerMonth;
      }, 0);
    }
    expenseByCategory[category] = round2((expenseByCategory[category] || 0) + amount);
  }
  const expenseRows = expenses.map(e => ({ ...e, annualized: annualizedAmount(e) }));

  // Product views allocate shared fixed costs by each product's revenue share; business profit is still calculated once above.
  const productDisplay = productRows.map(p => {
    const revenueShare = revenue > 0 ? p.monthlyRevenue / revenue : (productRows.length ? 1 / productRows.length : 0);
    const sharedFixed = Math.max(0, fixedMonthly - p.productFixed) * revenueShare;
    return { ...p, allocatedFixed: round2(p.productFixed + sharedFixed), allocatedProfit: round2(p.monthlyRevenue - p.monthlyVariable - p.productFixed - sharedFixed) };
  });

  return {
    products: productRows,
    productDisplay,
    expenses: expenseRows,
    fixedMonthly,
    fixedAnnual: round2(fixedMonthly * 12),
    variablePerUnit: totalUnits > 0 ? round2(variable / totalUnits) : 0,
    variableMonthly: variable,
    contributionMonthly: totalContribution,
    weightedContribution: round2(weightedContribution),
    contributionPercent: revenue > 0 ? totalContribution / revenue : 0,
    weightedMonthlyPrice: round2(weightedMonthlyPrice),
    breakEvenUnits,
    breakEvenRevenue,
    revenue,
    totalCosts: round2(variable + fixedMonthly),
    operatingProfit,
    totalUnits,
    marginSafetyUnits,
    marginSafetyPercent,
    startupCash,
    expenseByCategory,
    unpricedCount: expenses.filter(e => e.evidence === "Unpriced risk" && Number(e.amount) === 0).length,
    illustrativeCount: expenses.filter(e => e.enabled && ["Illustrative", "Estimated"].includes(e.evidence)).length,
    uncitedMajorCount: expenses.filter(e => e.enabled && e.evidence !== "Researched" && e.evidence !== "Student-Entered" && ["Production", "Fulfillment", "Selling fees", "Labor"].includes(e.category)).length
  };
}

export function modelSignature(state) {
  const durable = {
    ventureId: state.ventureId,
    products: state.products,
    expenses: state.expenses,
    currentScenarioId: state.currentScenarioId,
    scenarios: state.scenarios
  };
  return JSON.stringify(durable);
}

export function markChanged(state) {
  if (state.evaluation) state.evaluation.stale = true;
  if (state.confirmation) state.confirmation.stale = true;
}

export function evaluateRisk(state, profile, competitorData) {
  const model = calculateModel(state);
  const warnings = [];
  const strengths = [];
  const recommendations = [];
  const allProducts = model.products;
  const noPositiveCM = allProducts.some(p => p.salesPerMonth > 0 && p.contributionPerUnit <= 0);
  if (noPositiveCM) warnings.push("At least one product has no positive contribution per unit. More sales at the current price and costs would not cover fixed operating costs.");
  if (model.operatingProfit < 0) warnings.push(`The current monthly model shows an operating loss of ${money(Math.abs(model.operatingProfit))} at ${model.totalUnits} assumed units.`);
  if (model.breakEvenUnits != null && model.totalUnits < model.breakEvenUnits) warnings.push(`Assumed volume is ${Math.max(0, model.breakEvenUnits - model.totalUnits)} units below modeled break-even each month.`);
  if (model.fixedMonthly > 0 && model.fixedMonthly / Math.max(model.revenue, 1) > 0.35) warnings.push("Fixed operating costs absorb more than 35% of current modeled revenue; a slower month would increase the loss risk.");
  if (model.illustrativeCount > 0) warnings.push(`${model.illustrativeCount} active cost lines are estimated or illustrative; supplier quotes and actual channel terms are not available for all major costs.`);
  if (model.unpricedCount > 0) warnings.push(`${model.unpricedCount} enabled cost or risk line(s) are explicitly unpriced; a displayed zero is not evidence the cost is zero.`);
  if (model.marginSafetyPercent != null && model.marginSafetyPercent < 0.15) warnings.push("The modeled margin of safety is under 15%, leaving little room for lower demand or higher costs.");
  warnings.push("Monthly unit volume is a student-entered assumption; no verified demand, conversion-rate, or sales-history evidence was supplied.");
  const costShockProfit = round2(model.revenue - (model.variableMonthly + model.fixedMonthly) * 1.10);
  const volumeShockProfit = round2(model.revenue * 0.75 - model.variableMonthly * 0.75 - model.fixedMonthly);
  if (model.operatingProfit >= 0 && costShockProfit < 0) warnings.push("A 10% increase across modeled operating costs turns the current monthly result negative.");
  if (model.operatingProfit >= 0 && volumeShockProfit < 0) warnings.push("A 25% lower unit volume turns the current monthly result negative under the current fixed-cost assumptions.");

  const selected = allProducts.find(p => p.id === state.products[0]?.id);
  const direct = profile.competitorFit === "matched" ? (competitorData?.competitors || []).filter(c => c.classification?.toLowerCase().includes("direct")) : [];
  const reps = profile.competitorFit === "matched" ? (competitorData?.pricing_offers || []).filter(o => o.representative) : [];
  const prices = reps.map(o => Number(o.current_listed_price)).filter(Number.isFinite);
  const competitorPrices = profile.competitorFit === "matched" ? reps.map(o => ({ name:o.competitor_name, price:Number(o.current_listed_price), verification:o.verification_status, url:o.source_url, product:o.product_name, researchDate:o.research_date })) : [];
  const sourceByUrl = new Map();
  for (const e of state.expenses.filter(e=>e.enabled && e.sourceUrl)) { if (!sourceByUrl.has(e.sourceUrl)) sourceByUrl.set(e.sourceUrl,{label:e.sourceLabel||"Published reference",value:`Supports ${e.name}`,url:e.sourceUrl,checked:e.sourceDate||"not recorded",status:e.evidence||"Reference"}); }
  for (const offer of reps) if (offer.source_url && !sourceByUrl.has(offer.source_url)) sourceByUrl.set(offer.source_url,{label:offer.source_type||"Competitor listing",value:`${offer.competitor_name}: ${money(offer.current_listed_price)} · ${offer.product_name}`,url:offer.source_url,checked:offer.research_date||"not recorded",status:offer.verification_status||"Observed listing"});
  const median = prices.length ? (prices.length % 2 ? prices[(prices.length - 1) / 2] : [...prices].sort((a,b)=>a-b).slice(prices.length/2-1,prices.length/2+1).reduce((a,b)=>a+b,0)/2) : null;
  const low = profile.pricingRange?.[0]; const high = profile.pricingRange?.[1];
  let competitive = "No like-for-like competitor set is available in the supplied Mission 1 data for this venture context.";
  if (profile.competitorFit === "matched" && selected && prices.length) {
    const cheaper = reps.filter(o => Number(o.current_listed_price) < selected.price).length;
    const higher = reps.filter(o => Number(o.current_listed_price) > selected.price).length;
    competitive = `${cheaper} representative folding-board listing(s) ${cheaper === 1 ? "is" : "are"} cheaper and ${higher} ${higher === 1 ? "is" : "are"} more expensive than ${money(selected.price)}. The Mission 1 representative median is ${money(median)}; its preliminary ${money(low)}–${money(high)} band is a hypothesis, not a demand test.`;
    if (selected.price < low || selected.price > high) warnings.push(`The selected price is outside Mission 1's preliminary ${money(low)}–${money(high)} range; this is a positioning difference, not a financial result by itself.`);
    else strengths.push("The selected price falls inside the preliminary Mission 1 range, which was proposed for testing rather than treated as a final recommendation.");
    if (selected.price > Math.max(...prices)) warnings.push("The selected price is above every representative price in the Mission 1 sample. A premium can still work, but the proposed product benefits have not been tested against the alternatives.");
  } else if (profile.id === "nara-tee") {
    competitive = "Mission 1 researches folding boards, not graphic T-shirts. The concept website displays $32, but that is not a competitor observation. A current comparable apparel set is still needed.";
    warnings.push("The available competitor dataset is for a different product category and cannot support a T-shirt price comparison.");
    warnings.push("The concept uses Google brand elements on merchandise. Google's guidance says not to use those elements on merchandise and permits school-project use; no commercial authorization is documented.");
  }

  if (profile.differentiationTested) strengths.push("The venture has documented product evidence supporting its stated differentiators.");
  else warnings.push("The product's main differentiators and any claimed customer benefit remain untested; prototype and customer evidence are missing.");
  if (model.breakEvenUnits === null) recommendations.push("Review the selected price and variable costs first; the current contribution is not positive, so no finite unit break-even is shown.");
  else recommendations.push(`Compare the break-even requirement of ${model.breakEvenUnits} units per month with paid tests or interview evidence before treating the volume assumption as achievable.`);
  recommendations.push("Replace the largest illustrative product, shipping, and selling-channel inputs with written supplier, carrier, and checkout quotes.");
  if (profile.id === "nara-tee") recommendations.push("For commercial use, resolve Google brand rights or redesign the concept without Google brand elements before taking orders.");
  if (profile.competitorFit !== "matched") recommendations.push("Build a like-for-like apparel competitor set before using price-versus-market conclusions.");
  recommendations.push("Run a small willingness-to-pay test at more than one price; observed competitor prices alone do not establish demand.");

  const financiallyUnsustainable = noPositiveCM;
  const highRisk = !financiallyUnsustainable && (model.operatingProfit < 0 || (model.breakEvenUnits != null && model.totalUnits < model.breakEvenUnits) || warnings.length >= 5);
  const moderateRisk = !financiallyUnsustainable && !highRisk && (model.illustrativeCount > 0 || model.unpricedCount > 0 || profile.competitorFit !== "matched");
  const classification = financiallyUnsustainable ? "Financially unsustainable under current assumptions" : highRisk ? "High modeled risk" : moderateRisk ? "Moderate modeled risk" : "Lower modeled risk";
  return {
    classification,
    criteria: "Transparent rule-based screen: negative/zero contribution is financially unsustainable; current operating loss or forecast below break-even is high modeled risk; meaningful unpriced/illustrative inputs or missing comparable research is at least moderate modeled risk. This does not predict business failure probability.",
    proposedPrice: selected?.price ?? 0,
    financialSummary: `${money(model.fixedMonthly)} monthly fixed cost; ${money(model.weightedContribution)} weighted monthly contribution per modeled unit; ${model.breakEvenUnits == null ? "no finite break-even at current contribution" : `${model.breakEvenUnits} units/month to break even`}; ${money(model.revenue)} revenue and ${signedMoney(model.operatingProfit)} modeled monthly operating result at ${model.totalUnits} assumed units.`,
    sensitivitySummary: `At the same unit volume, a 10% across-the-board operating-cost increase gives ${signedMoney(costShockProfit)} per month; a 25% volume decline gives ${signedMoney(volumeShockProfit)}. These are deterministic stress tests, not probability-weighted forecasts.`,
    competitiveSummary: competitive,
    competitorPrices,
    sources: [...sourceByUrl.values()],
    warnings,
    strengths,
    recommendations,
    missingEvidence: ["Supplier quotes and product bill of materials", "Validated sales volume and willingness-to-pay evidence", "Customer testing of product claims", ...(profile.competitorFit !== "matched" ? ["Comparable competitor pricing for the selected product category"] : []), ...(model.unpricedCount ? ["Price for unpriced startup/legal/risk items"] : [])],
    model,
    signature: modelSignature(state),
    evaluatedAt: new Date().toISOString()
  };
}

export function money(value, decimals = 2) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Number(value) || 0);
}

export function signedMoney(value) {
  const amount = Number(value) || 0;
  return `${amount >= 0 ? "+" : "−"}${money(Math.abs(amount))}`;
}

export function modelIntegrityCheck() {
  const fixture = {
    ventureId: "test",
    currentScenarioId: "test",
    scenarios: { test: { id:"test", name:"Test", units:100, expenseAmounts:{} } },
    products: [{ id:"p1", name:"Test item", price:20, period:"one-time", salesPerMonth:100 }],
    expenses: [
      { id:"v1", name:"unit COGS", enabled:true, timing:"recurring", classification:"variable", frequency:"perUnit", amount:8, amountMode:"flat", allocation:"product", productIds:["p1"] },
      { id:"fee", name:"rate", enabled:true, timing:"recurring", classification:"variable", frequency:"perUnit", amount:5, amountMode:"percent", allocation:"product", productIds:["p1"] },
      { id:"fixed", name:"rent", enabled:true, timing:"recurring", classification:"fixed", frequency:"monthly", amount:500, allocation:"shared", productIds:[] },
      { id:"start", name:"tool", enabled:true, timing:"startup", classification:"fixed", frequency:"oneTime", amount:1200, depreciationMonths:12, allocation:"shared", productIds:[] }
    ]
  };
  const result = calculateModel(fixture);
  const checks = [
    ["fixed includes monthly rent plus 12-month amortization", result.fixedMonthly === 600],
    ["unit contribution is price minus unit and percent costs", result.products[0].contributionPerUnit === 11],
    ["monthly revenue", result.revenue === 2000],
    ["monthly profit", result.operatingProfit === 500],
    ["break-even rounds units up", result.breakEvenUnits === 55],
    ["startup cash remains separate", result.startupCash === 1200]
  ];
  const zero = deepCopy(fixture); zero.products[0].price = 8; zero.expenses[1].amount = 0;
  const zeroResult = calculateModel(zero);
  checks.push(["zero contribution has no finite break-even", zeroResult.breakEvenUnits === null]);
  const negative = deepCopy(fixture); negative.products[0].price = 5;
  const negativeResult = calculateModel(negative);
  checks.push(["negative contribution has no finite break-even", negativeResult.breakEvenUnits === null]);
  return checks;
}
