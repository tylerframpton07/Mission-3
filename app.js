import config from "./venture_profiles.json" with { type: "json" };
import competitorData from "./competitor_data.json" with { type: "json" };
import {
  STORAGE_KEY, deepCopy, createInitialState, applyScenario, saveCurrentScenarioValues,
  calculateModel, evaluateRisk, markChanged, modelSignature, money, signedMoney
} from "./model.js";
import { buildConfirmedExport, buildReportDocument, downloadBlob } from "./report.js";

const ORIGINAL_WEBSITE = {
  repositoryUrl: "https://github.com/tylerframpton07/Google-Nara-Tee-Website",
  liveUrl: "https://tylerframpton07.github.io/Google-Nara-Tee-Website/"
};
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const money0 = value => new Intl.NumberFormat("en-US", {style:"currency",currency:"USD",maximumFractionDigits:0}).format(Number(value)||0);
const numberFormat = value => new Intl.NumberFormat("en-US", { maximumFractionDigits:0 }).format(Number(value)||0);
const slug = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const uid = prefix => `${prefix}-${Math.random().toString(36).slice(2,9)}`;
let state;
let toastTimer;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.version === 1 && config.profiles[saved.ventureId] && Array.isArray(saved.products) && Array.isArray(saved.expenses)) return saved;
  } catch { /* Use the authored defaults when browser storage is unavailable or corrupt. */ }
  const fresh = createInitialState(config, "nara-tee");
  fresh.contextAcknowledged = false;
  return fresh;
}

function profile() { return config.profiles[state.ventureId]; }
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch { toast("Browser storage is unavailable. Export a backup file."); }
}
function invalidate() { markChanged(state); save(); }
function toast(message) {
  const el = $("#toast"); el.textContent = message; el.classList.add("visible");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("visible"), 2600);
}
function checked(yes) { return yes ? "checked" : ""; }
function selected(value, target) { return value === target ? "selected" : ""; }
function statusClass(status) { return String(status || "").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""); }
function statusPill(status) { return `<span class="evidence-pill ${statusClass(status)}">${esc(status)}</span>`; }
function readableFrequency(freq, expense) {
  if (freq === "perUnit") return expense.unit?.includes("order") ? "Per order" : "Per unit";
  if (freq === "oneTime") return "One-time";
  return ({monthly:"Monthly",weekly:"Weekly",quarterly:"Quarterly",annual:"Annual"})[freq] || freq;
}
function currentProductsLabel() { return state.products.map(p => p.name).join(", "); }

function init() {
  state = loadState();
  setupNavigation();
  setupHandlers();
  render();
}

function render() {
  renderContext();
  renderCostTabs();
  renderExpenses();
  renderProducts();
  renderScenarios();
  renderSources();
  renderDynamic();
}

function renderContext() {
  const select = $("#venture-select");
  select.innerHTML = `<option value="" disabled>Choose a venture context…</option>${Object.values(config.profiles).map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}`;
  select.value = state.contextAcknowledged ? state.ventureId : "";
  const p = profile();
  const alert = $("#context-alert");
  if (!state.contextAcknowledged) {
    alert.classList.add("visible");
    alert.innerHTML = `<b>Before using the review, choose the venture context.</b> The folders contain two different product concepts. The original live website is <a href="${ORIGINAL_WEBSITE.liveUrl}" target="_blank" rel="noreferrer">Google Nara Tee</a> at a concept price of $32; Mission 1’s twelve-offer research covers the Quick-Fold Laundry Sorting Mat. The tee has no matching competitor dataset. Select your intended context above; this does not confirm a price.`;
  } else {
    alert.classList.remove("visible");
    alert.innerHTML = "";
  }
  $("#venture-context-status").textContent = state.contextAcknowledged ? (p.competitorFit === "matched" ? "Mission 1 research matches this concept" : "Mission 1 data is a different product category") : "Context required before evaluation";
  $("#research-date").textContent = p.competitorFit === "matched" ? "OCT 27, 2026" : "WEBSITE · LIVE";
  $("#market-date").textContent = p.competitorFit === "matched" ? "OCT 27, 2026" : "NOT AVAILABLE FOR APPAREL";
}

function categories() {
  const unique = [...new Set(state.expenses.map(e => e.category || "Other"))];
  return ["All costs", ...unique];
}

function renderCostTabs() {
  const container = $("#cost-tabs");
  container.innerHTML = categories().map(category => `<button class="segment-button ${state.activeCostCategory === category ? "active" : ""}" data-action="filter-cost" data-category="${esc(category)}">${esc(category)}</button>`).join("");
}

function renderExpenses() {
  const list = $("#expense-list");
  const items = state.expenses.filter(e => state.activeCostCategory === "All costs" || e.category === state.activeCostCategory);
  if (!items.length) { list.innerHTML = `<div class="empty-state">No costs in this view. Add a line or select another category.</div>`; return; }
  list.innerHTML = items.map(expenseCard).join("");
}

function expenseCard(e) {
  const range = e.range || { min:0, max:Math.max(100,Number(e.amount)||1), step:1 };
  const amount = Number(e.amount)||0;
  const percent = Math.max(0, Math.min(100, (amount - range.min) / Math.max(.0001, range.max - range.min) * 100));
  const ref = e.reference?.value;
  const marker = ref == null ? "" : `<span class="benchmark-marker" style="left:${Math.max(0,Math.min(100,(ref-range.min)/Math.max(.0001,range.max-range.min)*100))}%" title="${esc(e.reference.meaning)} Source: ${esc(e.sourceLabel)}"></span>`;
  const productChoice = e.allocation === "product" ? state.products.map(p => `<label class="check-chip"><input type="checkbox" data-action="assign-expense" data-id="${esc(e.id)}" value="${esc(p.id)}" ${checked(e.productIds?.includes(p.id))}>${esc(p.name)}</label>`).join("") : "";
  return `<article class="expense-row ${e.enabled?"":"disabled"}" data-expense-row="${esc(e.id)}">
    <div class="expense-top"><div><input class="expense-name" aria-label="Expense name" data-expense-field="name" data-id="${esc(e.id)}" value="${esc(e.name)}"><span class="expense-category">${esc(e.category)} · ${esc(e.timing === "startup" ? "STARTUP CASH" : e.classification.toUpperCase())}</span></div><div class="expense-controls">${statusPill(e.evidence)}<label class="toggle" title="Include this cost"><input type="checkbox" aria-label="Enable ${esc(e.name)}" data-action="toggle-expense" data-id="${esc(e.id)}" ${checked(e.enabled)}><span></span></label></div></div>
    <textarea class="expense-description" aria-label="Expense description" data-expense-field="description" data-id="${esc(e.id)}">${esc(e.description)}</textarea>
    <div class="expense-amount-row"><div><div class="expense-amount-label">CURRENT ${e.amountMode === "percent" ? "RATE" : "AMOUNT"} · ${esc(e.unit || "USD")}</div></div><input class="expense-input" type="number" aria-label="Current expense amount" data-expense-field="amount" data-id="${esc(e.id)}" min="${range.min}" max="${range.max}" step="${range.step}" value="${amount}"></div>
    <div class="expense-slider-wrap">${marker}<input class="expense-slider" type="range" aria-label="Adjust ${esc(e.name)}" data-expense-field="amount" data-id="${esc(e.id)}" min="${range.min}" max="${range.max}" step="${range.step}" value="${amount}" style="background:linear-gradient(90deg,#c5f26f ${percent}%,#344647 ${percent}%)" title="${e.reference?`${e.reference.meaning} Source: ${e.sourceLabel}`:"No sourced benchmark; the range is an editable planning control."}"><div class="slider-scale"><span>${e.amountMode === "percent" ? `${range.min}%` : money(range.min)}</span><span>${e.reference ? `REFERENCE · ${e.amountMode === "percent" ? `${ref}%` : money(ref)}` : "NO VERIFIED BENCHMARK"}</span><span>${e.amountMode === "percent" ? `${range.max}%` : money(range.max)}</span></div></div>
    ${e.reference ? `<div class="expense-benchmark"><span>REFERENCE MARKER</span><b title="${esc(e.reference.meaning)}">${e.amountMode === "percent" ? `${ref}%` : money(ref)} · ${esc(e.sourceLabel)}</b></div>` : `<div class="expense-benchmark"><span>REFERENCE</span><b>Illustrative / not sourced</b></div>`}
    <div class="expense-meta">
      <div class="meta-field"><label>CLASSIFICATION</label><select class="expense-select" data-expense-field="classification" data-id="${esc(e.id)}"><option ${selected(e.classification,"fixed")} value="fixed">Fixed</option><option ${selected(e.classification,"variable")} value="variable">Variable</option></select></div>
      <div class="meta-field"><label>WHEN IT OCCURS</label><select class="expense-select" data-expense-field="timing" data-id="${esc(e.id)}"><option ${selected(e.timing,"recurring")} value="recurring">Recurring</option><option ${selected(e.timing,"startup")} value="startup">One-time startup</option></select></div>
      <div class="meta-field"><label>FREQUENCY</label><select class="expense-select" data-expense-field="frequency" data-id="${esc(e.id)}"><option value="monthly" ${selected(e.frequency,"monthly")}>Monthly</option><option value="weekly" ${selected(e.frequency,"weekly")}>Weekly</option><option value="quarterly" ${selected(e.frequency,"quarterly")}>Quarterly</option><option value="annual" ${selected(e.frequency,"annual")}>Annual</option><option value="perUnit" ${selected(e.frequency,"perUnit")}>Per unit / order</option><option value="oneTime" ${selected(e.frequency,"oneTime")}>One-time</option></select></div>
      <div class="meta-field"><label>AMOUNT TYPE</label><select class="expense-select" data-expense-field="amountMode" data-id="${esc(e.id)}"><option value="flat" ${selected(e.amountMode,"flat")}>Flat amount</option><option value="percent" ${selected(e.amountMode,"percent")}>Percent of price</option></select></div>
      <div class="meta-field"><label>EVIDENCE LABEL</label><select class="expense-select" data-expense-field="evidence" data-id="${esc(e.id)}">${["Researched","Estimated","Illustrative","Student-Entered","Unpriced risk"].map(x=>`<option ${selected(e.evidence,x)}>${x}</option>`).join("")}</select></div>
      <div class="meta-field"><label>CAPITAL DEPRECIATION MONTHS</label><input class="expense-select" type="number" min="0" step="1" data-expense-field="depreciationMonths" data-id="${esc(e.id)}" value="${Number(e.depreciationMonths)||0}" title="Optional: a startup capital purchase enters break-even only through this monthly depreciation assumption."></div>
    </div>
    <textarea class="expense-assumptions" aria-label="Cost assumptions" data-expense-field="assumptions" data-id="${esc(e.id)}" placeholder="Assumptions">${esc(e.assumptions || "")}</textarea>
    <div class="expense-source"><span>${e.sourceUrl ? `<a href="${esc(e.sourceUrl)}" target="_blank" rel="noreferrer">${esc(e.sourceLabel || "Open source")} ↗</a><br>Checked ${esc(e.sourceDate || "not recorded")}` : `${esc(e.sourceLabel || "No source supplied")} · Checked ${esc(e.sourceDate || "not recorded")}`}</span><span>${e.timing === "startup" ? "EXCLUDED FROM OPEX" : `ANNUALIZED ${money(Number(e.annualized)||0)}`}</span></div>
    ${e.reference ? `<div class="expense-source"><span class="reference-explainer">${esc(e.reference.meaning)}</span></div>` : ""}
    ${e.custom ? `<div class="expense-source-edit"><label>Source label <input type="text" data-expense-field="sourceLabel" data-id="${esc(e.id)}" value="${esc(e.sourceLabel||"")}"></label><label>Source URL <input type="url" data-expense-field="sourceUrl" data-id="${esc(e.id)}" value="${esc(e.sourceUrl||"")}" placeholder="https://…"></label></div>` : ""}
    <div class="expense-scope"><span>Cost allocation</span><select class="expense-select" style="max-width:165px" data-expense-field="allocation" data-id="${esc(e.id)}"><option value="shared" ${selected(e.allocation,"shared")}>Shared business cost</option><option value="product" ${selected(e.allocation,"product")}>Product-specific</option></select></div>
    ${productChoice ? `<div class="product-assignment">${productChoice}</div>` : ""}
    ${e.custom ? `<div class="expense-foot-actions"><button class="delete-expense" data-action="delete-expense" data-id="${esc(e.id)}">Delete custom expense</button></div>` : ""}
  </article>`;
}

function renderProducts() {
  const holder = $("#product-list");
  holder.innerHTML = state.products.map((p,i) => {
    const related = state.expenses.filter(e=>e.enabled&&e.timing==="recurring"&&e.classification==="variable"&&(e.allocation!=="product"||!e.productIds?.length||e.productIds.includes(p.id)));
    const variable = related.reduce((sum,e)=>{
      if(e.amountMode==="percent") return sum + p.price*Number(e.amount||0)/100;
      if(e.frequency==="perUnit"||e.frequency==="oneTime") return sum+Number(e.amount||0);
      return sum;
    },0);
    return `<article class="product-card ${i===0?"primary":""}" data-product-card="${esc(p.id)}">${p.scenario ? `<span class="scenario-label">STUDENT SCENARIO</span>` : ""}${state.products.length>1?`<button class="remove-product" data-action="delete-product" data-id="${esc(p.id)}">Remove</button>`:""}
      <input class="product-name expense-name" aria-label="Product name" data-product-field="name" data-id="${esc(p.id)}" value="${esc(p.name)}">
      <textarea class="product-description" aria-label="Product description" data-product-field="description" data-id="${esc(p.id)}">${esc(p.description)}</textarea>
      <div class="product-feature-list">${(p.features||[]).map(f=>`<span class="feature-chip">${esc(f)}</span>`).join("")}</div>
      <div class="product-field"><label>OPTIONAL ADD-ONS · COMMA SEPARATED</label><input class="product-input" type="text" data-product-field="addOns" data-id="${esc(p.id)}" value="${esc((p.addOns||[]).join(", "))}" placeholder="Optional add-ons"></div>
      <div class="product-fields">
        <div class="product-field"><label>PRICE · USD</label><input class="product-input product-price" type="number" min="${profile().priceLow}" max="${profile().priceHigh}" step="0.01" data-product-field="price" data-id="${esc(p.id)}" value="${Number(p.price).toFixed(2)}"></div>
        <div class="product-field"><label>PRICING MODEL</label><select class="product-select" data-product-field="period" data-id="${esc(p.id)}"><option value="one-time" ${selected(p.period,"one-time")}>One-time purchase</option><option value="monthly" ${selected(p.period,"monthly")}>Monthly subscription</option><option value="annual" ${selected(p.period,"annual")}>Annual subscription</option></select></div>
        <div class="product-field"><label>ASSUMED UNITS / MONTH</label><input class="product-input" type="number" min="0" step="1" data-product-field="salesPerMonth" data-id="${esc(p.id)}" value="${Number(p.salesPerMonth)||0}"></div>
      </div>
      <div class="product-model-note">${p.period === "annual" ? "Annual price is normalized to monthly revenue per active subscriber; unit volume means active subscribers." : p.period === "monthly" ? "Monthly price per active subscription; unit volume means active subscribers." : "One-time price per sale unit; unit volume means monthly sales."}</div>
      <div class="product-calculation"><div><span>VARIABLE COST / BILLING UNIT</span><b data-product-variable="${esc(p.id)}">${money(variable)}</b></div><div><span>CONTRIBUTION / MONTHLY UNIT</span><b data-product-cm="${esc(p.id)}">—</b></div><div><span>REVENUE / MONTH</span><b data-product-revenue="${esc(p.id)}">—</b></div></div>
    </article>`;
  }).join("");
}

function renderScenarios() {
  const holder = $("#scenario-cards");
  holder.innerHTML = Object.values(state.scenarios).map(sc => {
    const temp=deepCopy(state); applyScenario(temp,sc.id); const result=calculateModel(temp);
    const isCustom = sc.custom;
    return `<article class="scenario-card ${state.currentScenarioId===sc.id?"active":""}" data-id="${esc(sc.id)}">
      <div class="scenario-top"><button class="scenario-select" data-action="select-scenario" data-id="${esc(sc.id)}"><h3>${esc(sc.name)}</h3><span class="scenario-status">${state.currentScenarioId===sc.id?"ACTIVE CASE":"SELECT CASE"}</span></button></div>
      <p>${esc(sc.note || (isCustom ? "Student-defined case. Editing its costs or units does not affect other scenarios." : "Editable operating assumptions; not a forecast."))}</p>
      <div class="scenario-values"><div>FIXED / MONTH<b>${money(result.fixedMonthly)}</b></div><div>PROFIT / MONTH<b class="${result.operatingProfit>=0?"positive":"negative"}">${signedMoney(result.operatingProfit)}</b></div><div>UNITS / MONTH<b>${numberFormat(result.totalUnits)}</b></div></div>
      <div class="scenario-custom-controls"><label for="sc-units-${esc(sc.id)}">Assumed total units / month</label><input id="sc-units-${esc(sc.id)}" type="number" min="0" step="1" value="${numberFormat(sc.units)}" data-scenario-units="${esc(sc.id)}" onclick="event.stopPropagation()" aria-label="${esc(sc.name)} assumed monthly units">${isCustom?`<span class="scenario-status">CUSTOM</span>`:""}</div>
    </article>`;
  }).join("");
}

function renderSources() {
  const holders = $("#source-register");
  const sourceMap = new Map();
  for (const expense of state.expenses) {
    if (!expense.sourceUrl) continue;
    const key = expense.sourceUrl;
    const row = sourceMap.get(key) || { label:expense.sourceLabel, url:key, date:expense.sourceDate, uses:[] };
    row.uses.push(expense.name); sourceMap.set(key,row);
  }
  const rows = [...sourceMap.values()].map(src=>`<article class="source-card"><h3>${esc(src.label)}</h3><p>Supports: ${esc(src.uses.join(", "))}</p><a href="${esc(src.url)}" target="_blank" rel="noreferrer">Open source ↗</a><span class="source-date">Checked ${esc(src.date || "not recorded")}</span></article>`);
  if(profile().competitorFit==="matched") rows.push(`<article class="source-card"><h3>Mission 1 competitive research</h3><p>Four representative single-board prices, twelve listed offers, and verification limitations. The market snapshot was checked October 27, 2026.</p><a href="${esc(profile().researchProjectUrl)}" target="_blank" rel="noreferrer">Open project repository ↗</a><span class="source-date">PRELIMINARY RANGE ${money(profile().pricingRange[0])}–${money(profile().pricingRange[1])}</span></article>`);
  else rows.push(`<article class="source-card"><h3>Original venture website</h3><p>Website concept and displayed $32 price. Exact garment specification, stock source, fulfillment terms, and selling channel are not documented on the page.</p><a href="${ORIGINAL_WEBSITE.liveUrl}" target="_blank" rel="noreferrer">Open live concept page ↗</a><span class="source-date">ORIGINAL WEBSITE REPOSITORY PROVIDED IN MISSION 3 SETUP</span></article>`);
  holders.innerHTML = rows.join("");
  $("#method-copy").innerHTML = `<p><b>Contribution:</b> monthly-equivalent price less variable cost per active unit. The per-unit payment fee is calculated from price and then normalized for annual subscriptions.</p><p><b>Break-even:</b> recurring fixed costs plus explicit capital depreciation divided by weighted contribution per unit, rounded up to whole units. If weighted contribution is zero or negative, the lab shows no finite break-even.</p><p><b>Operating profit:</b> monthly normalized revenue less all active recurring variable and fixed costs. Startup cash is shown separately; capital depreciation enters fixed costs only when the student sets a depreciation period.</p><p><b>Multi-product view:</b> product-level views allocate shared fixed overhead by revenue share. Total business profit counts shared overhead once. Break-even unit count uses the current assumed sales mix. Changing that mix changes the result.</p><p><b>Scenario view:</b> Lean, Typical, Expansion, and custom cases keep their own editable monthly unit assumptions and expense values. Higher spending does not create extra sales in the model.</p><p><b>Data persistence:</b> changes are stored in this browser's local storage. Clearing browser data or using a different device may remove access. Export the working JSON file to back up or move the model.</p><p><b>Research limitations:</b> supplier, shipping, marketing, legal, insurance, tax, and marketplace terms may differ from these references. Unpriced costs remain risks even when their editable amount is zero. No demand model is included.</p>`;
}

function renderDynamic() {
  const model=calculateModel(state);
  renderKpis(model);
  renderCostTotal(model);
  renderContribution(model);
  renderBreakEven(model);
  renderScenarioTable();
  renderScenarioChart();
  renderCostChart(model);
  renderSensitivity(model);
  renderProductChart(model);
  renderCompetitive(model);
  renderProductMetrics(model);
  renderReview();
}

function renderKpis(m) {
  const kpis = [
    { label:"FIXED OPERATING COST / MONTH", value:money(m.fixedMonthly), foot:`${money(m.fixedAnnual)} annualized`, class:"" },
    { label:"VARIABLE COST / MONTH", value:money(m.variableMonthly), foot:"At current expected volume", class:"" },
    { label:"VARIABLE COST / MODELED UNIT", value:money(m.variablePerUnit), foot:"Price-period normalized", class:"" },
    { label:"CONTRIBUTION / UNIT", value:money(m.weightedContribution), foot:`${(m.contributionPercent*100).toFixed(1)}% of revenue`, class:m.weightedContribution>0?"accent":"negative" },
    { label:"TOTAL OPERATING COST / MONTH", value:money(m.totalCosts), foot:"Fixed + variable operating costs", class:"" },
    { label:"BREAK-EVEN VOLUME / MONTH", value:m.breakEvenUnits==null?"Not reachable":numberFormat(m.breakEvenUnits), foot:m.breakEvenUnits==null?"Current contribution is not positive":`Revenue ${money(m.breakEvenRevenue)}`, class:m.breakEvenUnits==null?"negative":"" },
    { label:"EXPECTED REVENUE / MONTH", value:money(m.revenue), foot:`${numberFormat(m.totalUnits)} assumed units`, class:"" },
    { label:"MODELED OPERATING RESULT", value:signedMoney(m.operatingProfit), foot:"Monthly normalized model", class:m.operatingProfit>=0?"positive":"negative" },
    { label:"MARGIN OF SAFETY", value:m.marginSafetyPercent==null?"—":`${(m.marginSafetyPercent*100).toFixed(0)}%`, foot:m.marginSafetyUnits==null?"Not meaningful at current CM":`${numberFormat(m.marginSafetyUnits)} units above / (below) break-even`, class:m.marginSafetyPercent!=null&&m.marginSafetyPercent>0?"positive":"negative" },
    { label:"STARTUP CASH REQUIREMENT", value:money(m.startupCash), foot:"Separate from operating break-even", class:"" }
  ];
  $("#kpis").innerHTML=kpis.map(k=>`<article class="kpi-card ${k.class}"><div class="kpi-label">${k.label}</div><div class="kpi-value">${k.value}</div><div class="kpi-foot">${k.foot}</div></article>`).join("");
  $("#summary-banner").innerHTML=`<span><b>${esc(profile().name)}</b> · ${esc(profile().concept)}</span><span class="summary-right">${state.scenarios[state.currentScenarioId]?.name?.toUpperCase()||"CURRENT"} · ${numberFormat(m.totalUnits)} ASSUMED UNITS / MONTH</span>`;
}

function renderCostTotal(m) {
  const filtered=state.expenses.filter(e=>e.enabled&&(state.activeCostCategory==="All costs"||e.category===state.activeCostCategory));
  const active=filtered.filter(e=>e.timing==="recurring").length;
  const start=filtered.filter(e=>e.timing==="startup").length;
  $("#cost-total").textContent=`${active} recurring lines · ${start} startup lines · ${money(m.fixedMonthly)} operating fixed / month · ${money(m.startupCash)} startup cash`;
  for (const expense of state.expenses) {
    const row=document.querySelector(`[data-expense-row="${CSS.escape(expense.id)}"]`);
    const sum=row?.querySelector(".expense-source span:last-child");
    const calculated=m.expenses.find(x=>x.id===expense.id);
    if(sum) sum.textContent=expense.timing==="startup"?"EXCLUDED FROM OPEX":`ANNUALIZED ${money(calculated?.annualized||0)}`;
  }
}

function renderContribution(m) {
  const rows=m.products.map(p=>`<div class="contribution-row"><span>${esc(p.name)} · normalized revenue</span><b>${money(p.monthlyPricePerUnit)}</b></div><div class="contribution-row"><span>${esc(p.name)} · variable burden</span><b>− ${money(p.variablePerUnit)}</b></div><div class="contribution-row total"><span>${esc(p.name)} · contribution / unit</span><b>${money(p.contributionPerUnit)}</b></div>`).join("");
  $("#contribution-bridge").innerHTML=`${rows}<div class="contribution-row"><span>Business fixed cost / month</span><b>${money(m.fixedMonthly)}</b></div><div class="contribution-row"><span>Business operating result / month</span><b class="${m.operatingProfit>=0?"positive":"negative"}">${signedMoney(m.operatingProfit)}</b></div><div class="contribution-note">Contribution margin is the amount left after variable costs to cover fixed operating cost. ${m.breakEvenUnits==null?"No additional sales can cover fixed costs while contribution is zero or negative.":`The current sales mix produces a weighted contribution of ${money(m.weightedContribution)} per modeled unit.`}</div>`;
}

function svgText(x,y,value,cls="svg-label",anchor="middle") { return `<text x="${x}" y="${y}" text-anchor="${anchor}" class="${cls}">${esc(value)}</text>`; }
function lineChartMarkup(model, maxUnits) {
  const W=820,H=300,L=58,R=20,T=16,B=45,PW=W-L-R,PH=H-T-B;
  const range=Math.max(10,Math.min(10000,Number(maxUnits)||250));
  const maxY=Math.max(model.fixedMonthly*1.2, (model.weightedMonthlyPrice||0)*range*1.05, (model.fixedMonthly+model.variablePerUnit*range)*1.05, 1);
  const xp=x=>L+(x/range)*PW, yp=y=>T+PH-(y/maxY)*PH;
  const ticks=4, grid=[];
  for(let i=0;i<=ticks;i++){const val=maxY*i/ticks;grid.push(`<line x1="${L}" y1="${yp(val)}" x2="${W-R}" y2="${yp(val)}" class="svg-grid"/>${svgText(L-8,yp(val)+3,money0(val),"svg-label","end")}`);}
  const points=[]; const steps=45;
  for(let i=0;i<=steps;i++){const units=range*i/steps;const revenue=units*(model.weightedMonthlyPrice||0);const cost=model.fixedMonthly+units*model.variablePerUnit;points.push({x:xp(units),rev:yp(revenue),cost:yp(cost)});}
  const revPath=points.map((pt,i)=>`${i?"L":"M"}${pt.x.toFixed(2)},${pt.rev.toFixed(2)}`).join(" ");
  const costPath=points.map((pt,i)=>`${i?"L":"M"}${pt.x.toFixed(2)},${pt.cost.toFixed(2)}`).join(" ");
  const be=model.breakEvenUnits; const beInRange=be!=null&&be<=range; const visibleEnd=Math.min(range,model.totalUnits||range);
  const areaStart=points.filter(pt=>pt.x<=xp(visibleEnd));
  const selectedArea=areaStart.length>1?`<path d="${areaStart.map((pt,i)=>`${i?"L":"M"}${pt.x},${pt.rev}`).join(" ")} ${[...areaStart].reverse().map(pt=>`L${pt.x},${pt.cost}`).join(" ")} Z" class="${model.operatingProfit>=0?"svg-area-profit":"svg-area-loss"}"/>`:"";
  const bePoint=beInRange?`<line x1="${xp(be)}" y1="${T}" x2="${xp(be)}" y2="${T+PH}" class="svg-break-even"/><circle cx="${xp(be)}" cy="${yp(model.weightedMonthlyPrice*be)}" r="5" fill="#f2ce6d" class="svg-dot"/><text x="${Math.min(xp(be)+7,W-130)}" y="${Math.max(12,yp(model.weightedMonthlyPrice*be)-9)}" class="svg-break-label">BE ${numberFormat(be)}</text>`:"";
  const xTicks=[0,.25,.5,.75,1].map(frac=>({x:xp(range*frac),label:numberFormat(range*frac)}));
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Revenue and total cost by monthly units; break-even ${be==null?"unreachable":numberFormat(be)+" units"}">${grid.join("")}${selectedArea}<line x1="${L}" y1="${T+PH}" x2="${W-R}" y2="${T+PH}" class="svg-axis"/><path d="${revPath}" class="svg-line-revenue"/><path d="${costPath}" class="svg-line-cost"/>${bePoint}${xTicks.map(t=>svgText(t.x,H-18,t.label)).join("")}${svgText(W/2,H-2,"Units per month","svg-axis-title")}${svgText(16,T+11,"USD","svg-axis-title","start")}</svg>`;
}

function renderBreakEven(m) {
  $("#breakeven-chart").innerHTML=lineChartMarkup(m,state.chartRange);
  $("#breakeven-note").innerHTML=m.breakEvenUnits==null?`<b>No finite break-even under current assumptions.</b> Contribution is not positive, so more sales would not cover fixed costs.`:`Break-even occurs at about <b>${numberFormat(m.breakEvenUnits)} units / month</b> and ${money(m.breakEvenRevenue)} in normalized monthly revenue. The shaded region reflects current expected volume (${numberFormat(m.totalUnits)} units); the lines hold price, variable cost, and sales mix constant.`;
}

function simulateScenario(id) { const s=deepCopy(state); applyScenario(s,id); return calculateModel(s); }
function renderScenarioTable() {
  const scenarios=Object.values(state.scenarios);
  const rows=scenarios.map(sc=>{const m=simulateScenario(sc.id);return `<tr><td>${esc(sc.name)}${state.currentScenarioId===sc.id?" · ACTIVE":""}</td><td>${money(m.fixedMonthly)}</td><td>${money(m.variablePerUnit)}</td><td>${state.products.map(p=>money(p.price)).join(" / ")}</td><td>${m.breakEvenUnits==null?"No finite BE":numberFormat(m.breakEvenUnits)}</td><td>${numberFormat(m.totalUnits)}</td><td>${money(m.revenue)}</td><td class="${m.operatingProfit>=0?"positive":"negative"}">${signedMoney(m.operatingProfit)}</td></tr>`;}).join("");
  $("#scenario-table").innerHTML=`<table class="results-table"><thead><tr><th>SCENARIO</th><th>FIXED / MONTH</th><th>VARIABLE / UNIT</th><th>PRICE(S)</th><th>BREAK-EVEN</th><th>ASSUMED UNITS</th><th>REVENUE</th><th>OPERATING RESULT</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function barSvg(items, options={}) {
  if(!items.length) return `<div class="no-data">No values to display in this chart.</div>`;
  const W=780,H=220,L=155,R=78,T=10,rowH=34,max=Math.max(1,...items.map(x=>Math.abs(x.value))); const inner=W-L-R;
  const bars=items.map((item,i)=>{const y=T+i*rowH+5;const width=Math.max(2,Math.abs(item.value)/max*inner);const color=item.value<0?"#f17970":(item.color||"#6be1bc");return `<text x="${L-10}" y="${y+13}" text-anchor="end" class="bar-label">${esc(item.label)}</text><rect x="${L}" y="${y}" width="${width}" height="18" rx="4" fill="${color}" opacity=".85"/><text x="${L+width+7}" y="${y+13}" class="bar-value">${esc(item.display||money(item.value))}</text>`;}).join("");
  return `<svg viewBox="0 0 ${W} ${Math.max(H,T+items.length*rowH+8)}" role="img" aria-label="${esc(options.label||"Comparison chart")}">${bars}</svg>`;
}

function renderScenarioChart() {
  const rows=Object.values(state.scenarios).map(sc=>{const m=simulateScenario(sc.id);return {label:sc.name,value:m.operatingProfit,display:signedMoney(m.operatingProfit),color:sc.id===state.currentScenarioId?"#c5f26f":"#6be1bc"};});
  $("#scenario-chart").innerHTML=barSvg(rows,{label:"Operating result by editable scenario"});
}

function renderCostChart(model) {
  const holder=$("#cost-chart"); const entries=Object.entries(model.expenseByCategory).filter(([,value])=>value>0).sort((a,b)=>b[1]-a[1]);
  if(!entries.length){holder.innerHTML=`<div class="no-data">No enabled recurring costs in the current model.</div>`;return;}
  const colors=["#c5f26f","#6be1bc","#92b9ee","#efc96b","#c2a4f0","#f6937d","#65b4a1","#f27f73"];
  const total=entries.reduce((s,[,v])=>s+v,0); let offset=0; const r=68,c=2*Math.PI*r;
  const arcs=entries.map(([name,value],i)=>{const dash=value/total*c;const node=`<circle cx="104" cy="110" r="${r}" fill="none" stroke="${colors[i%colors.length]}" stroke-width="22" stroke-dasharray="${dash} ${c-dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 104 110)" data-category="${esc(name)}"><title>${esc(name)}: ${money(value)} / month</title></circle>`;offset+=dash;return node;}).join("");
  holder.innerHTML=`<svg viewBox="0 0 380 225" role="img" aria-label="Monthly costs by category"><g>${arcs}</g><text x="104" y="105" text-anchor="middle" class="svg-axis-title">MONTHLY</text><text x="104" y="124" text-anchor="middle" fill="#e8f0e8" font-size="13" font-family="DM Mono,monospace">${money0(total)}</text>${entries.map(([n,v],i)=>`<rect x="205" y="${23+i*24}" width="8" height="8" rx="2" fill="${colors[i%colors.length]}"/><text x="220" y="${32+i*24}" class="svg-legend">${esc(n)} · ${money(v)}</text>`).join("")}</svg><button class="segment-button" data-action="filter-cost" data-category="All costs">View all expense lines</button>`;
}

function renderSensitivity(model) {
  if(!model.products.length){$("#sensitivity-chart").innerHTML="";return;}
  const factors=[.6,.8,1,1.2,1.4]; const current=state.products[0]?.price||0;
  const rows=factors.map(factor=>{
    const temp=deepCopy(state);
    for(const p of temp.products) p.price=Math.max(0,Number(p.price)*factor);
    const m=calculateModel(temp);
    return {label:`${(factor*100).toFixed(0)}% · ${money(current*factor)}`,value:m.operatingProfit,display:signedMoney(m.operatingProfit),color:factor===1?"#c5f26f":undefined};
  });
  $("#sensitivity-chart").innerHTML=barSvg(rows,{label:"Operating result at price sensitivity steps"});
}

function renderProductChart(model) {
  const m=model.productDisplay;
  $("#product-chart").innerHTML=barSvg(m.map(p=>({label:p.name,value:p.allocatedProfit,display:signedMoney(p.allocatedProfit)})),{label:"Allocated product operating result"});
}

function renderCompetitive(m) {
  const p=profile();
  $("#competition-intro").textContent=p.competitorFit==="matched"?`Four comparable single-board reference prices from Mission 1, checked October 27, 2026. Listed prices can change and exclude shipping/tax.`:`The supplied Mission 1 competitor file is for folding boards, while this context is a T-shirt. It is intentionally excluded from tee price comparisons.`;
  const primary=state.products[0];
  const comps=p.competitorFit==="matched"?(competitorData.pricing_offers||[]).filter(o=>o.representative):[];
  const prices=comps.map(c=>Number(c.current_listed_price)).filter(Number.isFinite).sort((a,b)=>a-b);
  const med=prices.length%2?prices[(prices.length-1)/2]:prices.length?((prices[prices.length/2-1]+prices[prices.length/2])/2):null;
  if(p.competitorFit==="matched"&&primary){
    const cheaper=comps.filter(c=>Number(c.current_listed_price)<primary.price).length;
    const higher=comps.filter(c=>Number(c.current_listed_price)>primary.price).length;
    const inBand=p.pricingRange&&primary.price>=p.pricingRange[0]&&primary.price<=p.pricingRange[1];
    $("#competitive-summary").innerHTML=`<div><strong>${money(primary.price)} ${inBand?"· inside preliminary band":"· current product price"}</strong><p>${cheaper} representative alternative(s) lower · ${higher} higher · difference from median ${signedMoney(primary.price-med)}</p></div><div class="comp-score-side">MEDIAN ${money(med)}<br>RANGE ${money(p.pricingRange[0])}–${money(p.pricingRange[1])}</div>`;
    $("#competitor-list").innerHTML=comps.map(c=>{const comp=competitorData.competitors?.find(x=>x.id===c.competitor_id);const price=Number(c.current_listed_price);const delta=primary.price-price;return `<article class="competitor-card"><div><h3>${esc(c.competitor_name)}</h3><p>${esc(c.product_name)} · ${esc(comp?.classification||"Direct product")}</p><div class="comp-status">${esc(c.verification_status)} · CHECKED ${esc(c.research_date||"2026-10-27")}</div><div class="comp-delta ${delta>0?"higher":delta<0?"cheaper":"equal"}">${delta>0?"Your selected price is "+money(delta)+" higher":delta<0?"Your selected price is "+money(Math.abs(delta))+" lower":"Same listed price"}</div></div><div class="competitor-price">${money(price)}<div class="comp-status">${c.promotional_price?"PROMO":"LIST PRICE"}</div></div></article>`;}).join("");
    const allBelow=comps.filter(c=>Number(c.current_listed_price)<primary.price).map(c=>c.competitor_name);
    const allAbove=comps.filter(c=>Number(c.current_listed_price)>primary.price).map(c=>c.competitor_name);
    $("#market-caveat").innerHTML=`<b>Competitive attractiveness is not financial viability.</b> ${allBelow.length?`Lower-priced sample: ${esc([...new Set(allBelow)].join(", "))}.`:"No representative sample price is lower."} ${allAbove.length?`Higher-priced sample: ${esc([...new Set(allAbove)].join(", "))}.`:"No representative sample price is higher."} Compare only one-time folding-board listings; FlipFold/BoxLegend bundles are excluded from the representative median. Mission 1 also notes BoxLegend V3 sold out and Household Essentials is partially verified. Competitor prices do not prove willingness to pay.`;
  } else {
    $("#competitive-summary").innerHTML=`<div><strong>${money(primary?.price||0)} · no comparable market sample</strong><p>Mission 1's four direct alternatives sell folding boards, not T-shirts. The website's $32 is the concept's own displayed price.</p></div><div class="comp-score-side">MARKET MEDIAN<br>NOT ESTABLISHED</div>`;
    $("#competitor-list").innerHTML=`<div class="competitor-card"><div><h3>Comparable apparel prices are not in the supplied dataset</h3><p>No competitor price is presented as if it were a T-shirt alternative. Add a researched competitor offer to a future market dataset before using market positioning.</p></div><div class="competitor-price">—</div></div>`;
    const missionRows=(competitorData.pricing_offers||[]).filter(o=>o.representative).map(o=>`${esc(o.competitor_name)} ${money(o.current_listed_price)}`).join(" · ");
    $("#market-caveat").innerHTML=`<b>Unmatched Mission 1 data (shown for transparency only):</b> ${missionRows}. These folding-board prices are excluded from this T-shirt's cheaper/similar/higher counts, median, and risk score. The original site displays a $32 concept price; that does not establish a competitor position or an authorized commercial offer.`;
  }
}

function renderProductMetrics(m) {
  for(const p of m.products){
    const varEl=document.querySelector(`[data-product-variable="${CSS.escape(p.id)}"]`); if(varEl) varEl.textContent=money(p.variablePerUnit);
    const cmEl=document.querySelector(`[data-product-cm="${CSS.escape(p.id)}"]`); if(cmEl) cmEl.textContent=money(p.contributionPerUnit);
    const revEl=document.querySelector(`[data-product-revenue="${CSS.escape(p.id)}"]`); if(revEl) revEl.textContent=money(p.monthlyRevenue);
  }
  $("#product-summary").innerHTML=`<b>Business total</b> combines every product's expected revenue and variable cost, then subtracts shared fixed overhead once. Product result cards allocate shared overhead by revenue share only for display. Current case: ${esc(state.scenarios[state.currentScenarioId]?.name||"custom")} · ${numberFormat(m.totalUnits)} total assumed units per month.`;
}

function renderReview() {
  const output=$("#evaluation-output"), flow=$("#confirm-workflow");
  const evaluation=state.evaluation;
  if(!evaluation){output.innerHTML=`<div class="empty-state">No evaluation yet. Edit your assumptions, then evaluate the current model. Evaluation never confirms a decision for you.</div>`;flow.innerHTML="";return;}
  const stale=evaluation.stale||evaluation.signature!==modelSignature(state);
  if(stale) evaluation.stale=true;
  output.innerHTML=`<article class="evaluation-card"><div class="evaluation-header"><div><div class="eyebrow">${stale?"PREVIOUS REVIEW IS OUTDATED":"EVALUATED · "+new Date(evaluation.evaluatedAt).toLocaleString()}</div><h3>Pricing assessment</h3></div><span class="risk-pill ${statusClass(evaluation.classification)}">${esc(evaluation.classification)}</span></div><div class="evaluation-body">
    <div class="evaluation-block"><h4>Financial findings</h4><p>${esc(evaluation.financialSummary)}</p><p>${esc(evaluation.sensitivitySummary||"")}</p></div>
    <div class="evaluation-block"><h4>Competitive position</h4><p>${esc(evaluation.competitiveSummary)}</p></div>
    <div class="evaluation-block"><h4>Strategy strengths</h4>${evaluation.strengths.length?`<ul>${evaluation.strengths.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:`<p>No validated differentiator is currently documented.</p>`}</div>
    <div class="evaluation-block"><h4>Risks and warnings</h4>${evaluation.warnings.length?`<ul>${evaluation.warnings.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:`<p>No major rule-triggered warnings in this model. Assumptions still need verification.</p>`}</div>
    <div class="evaluation-block wide"><h4>Evidence gaps</h4><ul>${evaluation.missingEvidence.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div>
    <div class="evaluation-block wide"><h4>Practical next steps</h4><ul>${evaluation.recommendations.map(x=>`<li>${esc(x)}</li>`).join("")}</ul><p class="criteria-note">${esc(evaluation.criteria)}</p></div>
  </div></article>`;
  if(stale){
    flow.innerHTML=`<div class="decision-status stale"><span>Your model changed after the review. Re-evaluate before confirming or downloading a new report.</span><button class="button button-outline" data-action="reevaluate">Evaluate current model</button></div>`;
  } else if(state.confirmation && !state.confirmation.stale){
    flow.innerHTML=`<div class="decision-status"><span>Decision confirmed by you on ${new Date(state.confirmation.confirmedAt).toLocaleString()}. This is the saved decision snapshot.</span><button class="button button-outline" data-action="revise">Revise my pricing</button></div><div class="confirm-panel"><h3>Download My Pricing Decision Report</h3><p>The DOCX report and JSON handoff use the same confirmed snapshot. The JSON includes private planning assumptions separately from the public-facing offer fields.</p><div class="confirm-actions"><button class="button button-outline" data-action="download-json">Download Pricing Decision Data JSON</button><button class="button button-accent" data-action="download-docx">Download My Pricing Decision Report</button></div></div>`;
  } else {
    const warnings=evaluation.warnings.length;
    flow.innerHTML=`<div class="confirm-panel"><h3>Revise or confirm your decision</h3><p>You can confirm an unconventional price or a high-risk assessment after reviewing it. Confirmation records your snapshot; it does not approve the business or validate the assumptions.</p>${warnings?`<label class="warning-ack"><input type="checkbox" id="ack-warnings">I reviewed the ${warnings} warning(s) in this evaluation and understand the unresolved risks.</label>`:""}<label class="meta-field" for="student-justification">YOUR PRICING JUSTIFICATION · REQUIRED</label><textarea class="justification" id="student-justification" placeholder="Why did you select this price? Explain how it relates to your costs, the alternatives, and the value you intend to deliver."></textarea><div class="confirm-actions"><button class="button button-outline" data-action="revise">Revise my pricing</button><button class="button button-accent" data-action="confirm-decision">Confirm my pricing decision <span>→</span></button></div></div>`;
    const confirm=$("[data-action='confirm-decision']",flow);
    if(confirm) confirm.disabled=true;
    const updateConfirm=()=>{const ack=$("#ack-warnings")?.checked ?? warnings===0;const text=$("#student-justification")?.value.trim()||"";if(confirm)confirm.disabled=!(ack&&text.length>=15);};
    $("#ack-warnings",flow)?.addEventListener("change",updateConfirm);
    $("#student-justification",flow)?.addEventListener("input",updateConfirm);
    updateConfirm();
  }
}

function setupNavigation() {
  const links=$$(".nav-links a");
  const observer=new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting){const id=entry.target.id;links.forEach(a=>a.classList.toggle("active",a.getAttribute("href")===`#${id}`));}}},{rootMargin:"-30% 0px -60% 0px",threshold:0});
  for(const link of links){const section=$(link.getAttribute("href"));if(section)observer.observe(section);}
}

function setupHandlers() {
  document.addEventListener("input", event=>{
    const el=event.target;
    if(el.matches("[data-expense-field]")) handleExpenseInput(el);
    else if(el.matches("[data-product-field]")) handleProductInput(el);
    else if(el.matches("[data-scenario-units]")) handleScenarioUnits(el);
    else if(el.id==="chart-range"){state.chartRange=Math.max(10,Math.min(10000,Number(el.value)||250));save();renderBreakEven(calculateModel(state));}
  });
  document.addEventListener("change", event=>{
    const el=event.target;
    if(el.id==="venture-select") switchContext(el.value);
    else if(el.matches("select[data-expense-field]")) handleExpenseSelect(el);
    else if(el.matches("[data-action='toggle-expense']")){const e=expense(el.dataset.id);if(e){e.enabled=el.checked;markChanged(state);save();render();}}
    else if(el.matches("[data-action='assign-expense']")){const e=expense(el.dataset.id);if(e){const ids=new Set(e.productIds||[]);el.checked?ids.add(el.value):ids.delete(el.value);e.productIds=[...ids];markChanged(state);save();render();}}
  });
  document.addEventListener("click",event=>{
    const button=event.target.closest("[data-action]");if(button){handleAction(button,event);return;}
    if(event.target.id==="add-expense") addExpense();
    else if(event.target.id==="add-product") addProduct();
    else if(event.target.id==="save-scenario") addScenario();
    else if(event.target.id==="evaluate") runEvaluation();
    else if(event.target.id==="reset-model") resetModel();
    else if(event.target.id==="export-config") exportConfiguration();
    else if(event.target.id==="import-config") $("#import-file").click();
    else if(event.target.id==="help-button") window.alert("Edit the cost and sales assumptions. Results are monthly normalized estimates. Researched values are not quotes for your exact business. Your changes are saved in this browser; export a working JSON backup before switching devices or clearing browser data.");
  });
  $("#import-file").addEventListener("change",importConfiguration);
}

function expense(id){return state.expenses.find(e=>e.id===id);}
function product(id){return state.products.find(p=>p.id===id);}

function handleExpenseInput(el) {
  const e=expense(el.dataset.id); if(!e)return;
  const field=el.dataset.expenseField;
  if(field==="amount"){
    const parsed=Number(el.value); if(!Number.isFinite(parsed)) return;
    e.amount=parsed; saveCurrentScenarioValues(state); invalidate();
    const row=el.closest(".expense-row"); const slider=row?.querySelector(".expense-slider"); const num=row?.querySelector(".expense-input");
    if(slider&&el!==slider)slider.value=String(parsed); if(num&&el!==num)num.value=String(parsed);
    const scale=row?.querySelector(".slider-scale"); if(scale){const r=e.range||{min:0,max:100};const percent=Math.max(0,Math.min(100,(parsed-r.min)/(r.max-r.min||1)*100));slider.style.background=`linear-gradient(90deg,#c5f26f ${percent}%,#344647 ${percent}%)`;}
    renderDynamic();
  }else{
    e[field]=field==="depreciationMonths"?Math.max(0,Number(el.value)||0):el.value;
    if(field==="name"){
      const row=el.closest(".expense-row");const category=row?.querySelector(".expense-category");if(category)category.textContent=`${e.category} · ${e.timing==="startup"?"STARTUP CASH":e.classification.toUpperCase()}`;
    }
    if(field==="assumptions"||field==="description") { /* Text edits do not change arithmetic but do stale the written review. */ }
    invalidate();renderDynamic();
  }
}

function handleExpenseSelect(el) {
  const e=expense(el.dataset.id);if(!e)return;const f=el.dataset.expenseField;e[f]=el.value;
  if(f==="timing"&&e.timing==="startup")e.frequency="oneTime";
  if(f==="classification"&&e.classification==="variable"&&["monthly","weekly","quarterly","annual"].includes(e.frequency)&&e.amountMode!=="percent")e.frequency="perUnit";
  if(f==="allocation"&&e.allocation==="shared")e.productIds=[];
  else if(f==="allocation"&&e.allocation==="product"&&!e.productIds.length)e.productIds=[state.products[0]?.id].filter(Boolean);
  saveCurrentScenarioValues(state);invalidate();render();
}

function handleProductInput(el) {
  const p=product(el.dataset.id);if(!p)return;const field=el.dataset.productField;
  if(field==="price"||field==="salesPerMonth"){
    const n=Number(el.value);if(!Number.isFinite(n))return;p[field]=Math.max(0,n);invalidate();renderDynamic();
    if(field==="salesPerMonth"){saveCurrentScenarioValues(state);save();renderScenarios();}
  } else {p[field]=field==="addOns"?el.value.split(",").map(x=>x.trim()).filter(Boolean):el.value;invalidate();renderDynamic();}
}

function handleScenarioUnits(el) {
  const scenario=state.scenarios[el.dataset.scenarioUnits];if(!scenario)return;
  const n=Math.max(0,Number(el.value)||0);scenario.units=n;
  const total=state.products.reduce((s,p)=>s+(Number(p.salesPerMonth)||0),0);
  const weights=state.products.map(p=>total>0?(Number(p.salesPerMonth)||0)/total:1/Math.max(1,state.products.length));
  scenario.productUnits={};state.products.forEach((p,i)=>scenario.productUnits[p.id]=Math.round(n*weights[i]));
  if(state.currentScenarioId===scenario.id){let assigned=0;state.products.forEach((p,i)=>{p.salesPerMonth=i===state.products.length-1?n-assigned:Math.round(n*weights[i]);assigned+=p.salesPerMonth;});}
  saveCurrentScenarioValues(state);invalidate();renderDynamic();renderScenarioCardsOnly();
}

function renderScenarioCardsOnly(){const active=$$(".scenario-card");for(const card of active){const sc=state.scenarios[card.dataset.id];if(sc){const input=$("[data-scenario-units]",card);if(input&&document.activeElement!==input)input.value=String(sc.units);const result=simulateScenario(sc.id);const vals=$(".scenario-values",card);if(vals)vals.innerHTML=`<div>FIXED / MONTH<b>${money(result.fixedMonthly)}</b></div><div>PROFIT / MONTH<b class="${result.operatingProfit>=0?"positive":"negative"}">${signedMoney(result.operatingProfit)}</b></div><div>UNITS / MONTH<b>${numberFormat(result.totalUnits)}</b></div>`;}}}

function handleAction(button,event) {
  const action=button.dataset.action, id=button.dataset.id;
  if(action==="filter-cost"){state.activeCostCategory=button.dataset.category;save();renderCostTabs();renderExpenses();renderDynamic();}
  else if(action==="select-scenario"){saveCurrentScenarioValues(state);applyScenario(state,id);markChanged(state);save();render();}
  else if(action==="delete-expense"){if(window.confirm("Delete this custom expense?")){state.expenses=state.expenses.filter(e=>e.id!==id);for(const sc of Object.values(state.scenarios))delete sc.expenseAmounts[id];markChanged(state);save();render();}}
  else if(action==="delete-product"){if(state.products.length<2)return;if(window.confirm("Remove this student scenario and its product-specific assignments?")){state.products=state.products.filter(p=>p.id!==id);state.expenses.forEach(e=>e.productIds=(e.productIds||[]).filter(pid=>pid!==id));for(const sc of Object.values(state.scenarios)){delete sc.productUnits?.[id];}markChanged(state);save();render();}}
  else if(action==="reevaluate")runEvaluation();
  else if(action==="revise"){state.evaluation=null;if(state.confirmation)state.confirmation.stale=true;save();renderReview();$("#products").scrollIntoView({behavior:"smooth"});}
  else if(action==="confirm-decision")confirmDecision();
  else if(action==="download-docx")downloadConfirmed("docx");
  else if(action==="download-json")downloadConfirmed("json");
}

function switchContext(ventureId) {
  if(!config.profiles[ventureId])return;
  state=createInitialState(config,ventureId);state.contextAcknowledged=true;save();render();toast(`${profile().name} context loaded. No price decision has been confirmed.`);
}

function addExpense() {
  const e={id:uid("expense"),name:"New student-entered cost",category:"Other",description:"Describe why this cost is relevant to the venture.",classification:"variable",timing:"recurring",frequency:"perUnit",amount:0,amountMode:"flat",currency:"USD",unit:"per unit",allocation:"shared",productIds:[],evidence:"Student-Entered",sourceLabel:"Entered by student",sourceUrl:"",sourceDate:new Date().toISOString().slice(0,10),reference:null,assumptions:"Enter source or reasoning. A zero value does not mean the cost is free.",enabled:true,custom:true,range:{min:0,max:10000,step:1}};
  state.expenses.push(e);for(const sc of Object.values(state.scenarios))sc.expenseAmounts[e.id]=0;state.activeCostCategory="All costs";markChanged(state);save();render();document.querySelector(`[data-expense-field="name"][data-id="${CSS.escape(e.id)}"]`)?.focus();
}

function addProduct() {
  const id=uid("product");const p={id,name:"New product scenario",description:"Student-created scenario. Add a clear customer-facing description and edit its price and volume assumptions.",features:["Student scenario"],price:20,period:"one-time",salesPerMonth:0,scenario:true,addOns:[]};
  state.products.push(p);
  const e={id:uid("expense"),name:`Variable cost · ${p.name}`,category:"Production",description:"Enter the variable costs that apply to this product scenario. No amount has been researched.",classification:"variable",timing:"recurring",frequency:"perUnit",amount:0,amountMode:"flat",currency:"USD",unit:"per unit",allocation:"product",productIds:[id],evidence:"Student-Entered",sourceLabel:"Set by student",sourceUrl:"",sourceDate:new Date().toISOString().slice(0,10),reference:null,assumptions:"Include materials, production, packaging, inbound freight, fulfillment, payment fees, returns, and other sale-linked costs as separate lines where useful.",enabled:true,custom:true,range:{min:0,max:10000,step:1}};
  state.expenses.push(e);for(const sc of Object.values(state.scenarios)){sc.expenseAmounts[e.id]=0;sc.productUnits ||= {};sc.productUnits[id]=0;}
  markChanged(state);save();render();document.querySelector(`[data-product-field="name"][data-id="${CSS.escape(id)}"]`)?.focus();
}

function addScenario() {
  const current=state.scenarios[state.currentScenarioId];if(!current)return;
  const name=window.prompt("Name this custom operating scenario:","My custom case");if(!name?.trim())return;
  saveCurrentScenarioValues(state);const id=uid("custom");state.scenarios[id]={...deepCopy(current),id,name:name.trim(),custom:true,note:"Student-defined case; units and each cost assumption can be changed independently."};applyScenario(state,id);markChanged(state);save();render();
}

function runEvaluation() {
  if(!state.contextAcknowledged){toast("Choose and acknowledge a venture context first.");$("#venture-select").focus();return;}
  saveCurrentScenarioValues(state);
  const result=evaluateRisk(state,profile(),competitorData);
  result.competitorPrices=profile().competitorFit==="matched"?(competitorData.pricing_offers||[]).filter(o=>o.representative).map(o=>({name:o.competitor_name,price:Number(o.current_listed_price),verification:o.verification_status,url:o.source_url})):[];
  const applicableBenchmarks=config.benchmarks.filter(b=>profile().competitorFit!=="matched" || /stripe/i.test(b.label));
  result.sources=[...new Map([...result.sources,...applicableBenchmarks].map(source=>[source.url,source])).values()];
  state.evaluation=result;state.confirmation=null;save();renderDynamic();$("#review").scrollIntoView({behavior:"smooth"});
}

function confirmDecision() {
  const e=state.evaluation;const ack=$("#ack-warnings")?.checked ?? e?.warnings?.length===0;const justification=$("#student-justification")?.value.trim()||"";
  if(!e||e.stale||e.signature!==modelSignature(state)){toast("Re-evaluate the changed model before confirming.");return;}
  if(!ack){toast("Acknowledge the warnings before confirming.");return;}
  if(justification.length<15){toast("Write a short pricing justification before confirming.");return;}
  const report=buildConfirmedExport(state,profile(),e,justification,ack,ORIGINAL_WEBSITE);
  state.confirmation={confirmedAt:report.data.confirmation.confirmedAt,signature:modelSignature(state),stale:false,justification,acknowledgedWarnings:ack,report};save();renderReview();toast("Your pricing decision snapshot is confirmed.");
}

function downloadConfirmed(kind) {
  const c=state.confirmation;
  if(!c||c.stale||c.signature!==modelSignature(state)){toast("Your model changed; evaluate and confirm the new decision first.");return;}
  if(kind==="json"){
    const blob=new Blob([JSON.stringify(c.report.data,null,2)],{type:"application/json"});downloadBlob(blob,"Pricing_Decision_Data.json");
  }else{
    const bytes=buildReportDocument(c.report);const blob=new Blob([bytes],{type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"});downloadBlob(blob,"Pricing_Decision_Report.docx");
  }
}

function resetModel() {
  if(!window.confirm("Restore the suggested costs and products for this venture context? This replaces this context's local working changes."))return;
  const id=state.ventureId;state=createInitialState(config,id);state.contextAcknowledged=true;state.ventureId=id;save();render();toast("Suggested values restored.");
}

function exportConfiguration() {
  saveCurrentScenarioValues(state);
  const payload={format:"Mission 3 Pricing Laboratory working configuration",version:1,exportedAt:new Date().toISOString(),state};
  downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),"Pricing_Laboratory_Working_Configuration.json");
}

function importConfiguration(event) {
  const file=event.target.files?.[0];if(!file)return;
  const reader=new FileReader();reader.onload=()=>{
    try{const parsed=JSON.parse(reader.result);const next=parsed.state||parsed;if(next.version!==1||!config.profiles[next.ventureId]||!Array.isArray(next.products)||!Array.isArray(next.expenses)||!next.scenarios)throw new Error("This is not a supported Pricing Laboratory backup.");
      state=next;markChanged(state);save();render();toast("Working configuration imported. Run a fresh evaluation before confirming.");
    }catch(error){window.alert(`Could not import this file: ${error.message}`);}finally{event.target.value="";}
  };reader.readAsText(file);
}

init();
