import { calculateModel, money, signedMoney, annualizedAmount } from "./model.js";

const esc = value => String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString("en-US", { year:"numeric", month:"long", day:"numeric" }) : "Not recorded";

export function buildConfirmedExport(state, profile, evaluation, justification, acknowledgedWarnings, ventureWebsite) {
  const model = calculateModel(state);
  const selectedProfileProduct = state.products[0];
  const snapshotTime = new Date().toISOString();
  const activeExpenses = state.expenses.filter(e => e.enabled).map(e => ({
    id: e.id, name: e.name, description: e.description, category: e.category,
    classification: e.classification, timing: e.timing, frequency: e.frequency,
    amount: Number(e.amount || 0), amountMode: e.amountMode, currency: e.currency || "USD", unit: e.unit,
    annualized: e.timing === "recurring" ? annualizedAmount(e) : 0,
    allocation: e.allocation, productIds: e.productIds || [], evidence: e.evidence,
    source: e.sourceUrl ? { label: e.sourceLabel, url: e.sourceUrl, checked: e.sourceDate || null } : null,
    assumptions: e.assumptions, depreciationMonths: Number(e.depreciationMonths || 0),
    includedInOperatingBreakEven: e.timing === "recurring" || Number(e.depreciationMonths) > 0,
    includedInStartupCash: e.timing === "startup"
  }));
  const data = {
    schemaVersion: "1.0",
    generatedAt: snapshotTime,
    venture: {
      name: profile.name, concept: profile.concept, targetCustomers: profile.customers,
      valueProposition: profile.value, distribution: profile.distribution, geography: profile.geography,
      originalWebsiteRepositoryUrl: ventureWebsite.repositoryUrl,
      originalLiveWebsiteUrl: ventureWebsite.liveUrl,
      researchContext: profile.id,
      researchContextMismatch: profile.competitorFit !== "matched" ? profile.researchStatus : null
    },
    customerFacingOffer: state.products.map(product => ({
      name: product.name, description: product.description, features: product.features || [],
      price: Number(product.price), currency: "USD", pricingModel: product.period,
      billingUnit: product.period === "annual" ? "per customer per year" : product.period === "monthly" ? "per customer per month" : "per one-time unit",
      optionalAddOns: product.addOns || [],
      privacy: "Public offer fields only; internal cost, volume, margin, and student reasoning are excluded."
    })),
    financialAssumptions: {
      privatePlanningData: true,
      selectedScenario: state.scenarios[state.currentScenarioId]?.name,
      timeHorizonMonths: 1,
      unitsPerMonth: model.totalUnits,
      products: state.products.map(p => ({ name:p.name, price:Number(p.price), pricingPeriod:p.period, expectedUnitsPerMonth:Number(p.salesPerMonth || 0) })),
      expenses: activeExpenses,
      fixedOperatingCostsMonthly: model.fixedMonthly,
      variableCostsMonthly: model.variableMonthly,
      revenueMonthly: model.revenue,
      totalOperatingCostsMonthly: model.totalCosts,
      operatingProfitMonthly: model.operatingProfit,
      breakEvenUnitsMonthly: model.breakEvenUnits,
      breakEvenRevenueMonthly: model.breakEvenRevenue,
      contributionMarginPerModeledUnit: model.weightedContribution,
      contributionMarginPercent: model.contributionPercent,
      marginOfSafetyUnits: model.marginSafetyUnits,
      marginOfSafetyPercent: model.marginSafetyPercent,
      startupCashRequirement: model.startupCash,
      explanation: "All volumes are student assumptions. Annual subscription values are normalized to monthly revenue. Shared fixed costs are counted once in business profit and allocated by revenue share only in product-level displays. Startup cash is separate from operating break-even; a stated depreciation period adds monthly depreciation to fixed cost without changing the startup cash figure."
    },
    competitivePosition: {
      competitorFit: profile.competitorFit,
      researchDate: "2026-10-27",
      preliminaryRange: profile.pricingRange,
      summary: evaluation.competitiveSummary,
      prices: profile.competitorFit === "matched" ? (evaluation.competitorPrices || []) : [],
      limitations: profile.disclaimer
    },
    review: {
      riskClassification: evaluation.classification,
      criteria: evaluation.criteria,
      financialFindings: evaluation.financialSummary,
      warnings: evaluation.warnings,
      strengths: evaluation.strengths,
      missingEvidence: evaluation.missingEvidence,
      recommendations: evaluation.recommendations,
      studentAcknowledgedWarnings: Boolean(acknowledgedWarnings)
    },
    decisionStatement: justification,
    confirmation: {
      confirmed: true,
      confirmedAt: snapshotTime,
      confirmedPrices: state.products.map(p => ({ name:p.name, price:Number(p.price), currency:"USD", pricingModel:p.period })),
      evaluationStatus: "Current at confirmation",
      confirmationStatus: "Student confirmed",
      warningsAcknowledged: Boolean(acknowledgedWarnings),
      acknowledgedWarningText: acknowledgedWarnings ? evaluation.warnings : []
    },
    sourcesAndLimitations: {
      benchmarkSources: evaluation.sources || [],
      competitorResearchDate: "2026-10-27",
      limitations: [profile.disclaimer, "Current costs and volumes are not verified forecasts. Market prices may change after the research snapshot.", "Taxes, shipping collected from customers, marketplace commissions, and financing costs are not included unless entered as a cost."]
    }
  };
  const report = { data, model, evaluation, state: structuredClone(state), profile, ventureWebsite, selectedProfileProduct, generatedAt: snapshotTime };
  return report;
}

const p = (text, style = "Normal") => `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
const bullet = text => p(`- ${text}`);
const table = rows => {
  const rowXml = rows.map((row, i) => `<w:tr>${row.map(cell => `<w:tc><w:tcPr><w:tcW w:w="${Math.floor(9000/row.length)}" w:type="dxa"/>${i===0?'<w:shd w:fill="203532"/>':''}</w:tcPr><w:p><w:pPr><w:spacing w:after="80"/></w:pPr><w:r>${i===0?'<w:rPr><w:b/><w:color w:val="BDE98D"/></w:rPr>':''}<w:t xml:space="preserve">${esc(cell)}</w:t></w:r></w:p></w:tc>`).join("")}</w:tr>`).join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="9AAFA5"/><w:left w:val="single" w:sz="4" w:color="D8E0D9"/><w:bottom w:val="single" w:sz="4" w:color="9AAFA5"/><w:right w:val="single" w:sz="4" w:color="D8E0D9"/><w:insideH w:val="single" w:sz="4" w:color="D8E0D9"/><w:insideV w:val="single" w:sz="4" w:color="D8E0D9"/></w:tblBorders></w:tblPr>${rowXml}</w:tbl>`;
};

export function buildReportDocument(report) {
  const { data, model, evaluation, profile, ventureWebsite } = report;
  const rows = [];
  const products = data.customerFacingOffer;
  const expenses = data.financialAssumptions.expenses;
  const productRows = model.productDisplay;
  rows.push(p("Pricing Decision Report", "Title"));
  rows.push(p(`${profile.name} | Confirmed student pricing snapshot | ${fmtDate(data.confirmation.confirmedAt)}`, "Subtitle"));
  rows.push(p("This report records the student's confirmed price and the financial assumptions reviewed at that time. It separates observed research from estimates and student-entered planning values. Financial results are scenario outputs, not forecasts."));
  rows.push(p("1. Venture Overview", "Heading1"));
  rows.push(p(`Venture: ${profile.name}`));
  rows.push(p(`Business concept: ${profile.concept}`));
  rows.push(p(`Target customers: ${profile.customers}`));
  rows.push(p(`Value proposition: ${profile.value}`));
  rows.push(p(`Distribution and geography: ${profile.distribution} ${profile.geography}`));
  rows.push(p("2. Website Information", "Heading1"));
  rows.push(p(`Original venture website repository: ${ventureWebsite.repositoryUrl}`));
  rows.push(p(`Original live venture website: ${ventureWebsite.liveUrl}`));
  if (profile.competitorFit !== "matched") rows.push(p(`Context note: ${profile.researchStatus} The website and supplied Mission 1 data describe different products.`));
  rows.push(p("3. Final Pricing Decision", "Heading1"));
  rows.push(table([["Product or plan","Confirmed price","Pricing unit","Customer-facing features"], ...products.map(o=>[o.name,money(o.price),o.billingUnit,[...o.features,...o.optionalAddOns.map(x=>`Add-on: ${x}`)].join("; ")])]));
  rows.push(p(`Student justification: ${data.decisionStatement}`));
  rows.push(p("4. Cost Assumptions", "Heading1"));
  rows.push(table([["Expense","Amount","Frequency / class","Evidence","Source / assumptions"], ...expenses.map(e=>[
    e.name, e.amountMode==="percent"?`${e.amount}%`:money(e.amount), `${e.timing} · ${e.frequency} · ${e.classification}`,
    e.evidence, `${e.source?.label||"No source supplied"}${e.source?.url?` — ${e.source.url}`:""}. ${e.assumptions}`
  ])]));
  rows.push(p(`Startup cash requirement (separate): ${money(model.startupCash)}. Startup costs are not automatically annualized. Only expenses with an explicit depreciation period enter operating break-even as depreciation.`));
  rows.push(p("5. Financial Results", "Heading1"));
  rows.push(table([["Monthly result","Value"],
    ["Fixed operating costs",money(model.fixedMonthly)],
    ["Variable costs at assumed volume",money(model.variableMonthly)],
    ["Revenue at assumed volume",money(model.revenue)],
    ["Expected operating profit / loss",signedMoney(model.operatingProfit)],
    ["Contribution per modeled unit",money(model.weightedContribution)],
    ["Break-even units",model.breakEvenUnits==null?"No finite break-even: contribution is not positive":`${model.breakEvenUnits} units / month`],
    ["Break-even revenue",model.breakEvenRevenue==null?"Not available":money(model.breakEvenRevenue)],
    ["Margin of safety",model.marginSafetyPercent==null?"Not available":`${model.marginSafetyUnits} units (${(model.marginSafetyPercent*100).toFixed(1)}%)`],
    ["Assumed monthly units",String(model.totalUnits)]
  ]));
  rows.push(p("Time horizon: normalized monthly operations. Sales volumes and fixed-cost scenarios are student assumptions, not verified forecasts. Contribution margin is price per normalized billing period less variable costs per normalized period. Break-even units use the expected sales mix when more than one product is modeled."));
  rows.push(table([["Product","Price","Variable cost / unit","Contribution / unit","Expected monthly units","Revenue / month","Allocated product result"], ...productRows.map(p=>[p.name,money(p.price),money(p.variablePerUnit),money(p.contributionPerUnit),String(p.salesPerMonth),money(p.monthlyRevenue),signedMoney(p.allocatedProfit)])]));
  rows.push(p("Shared fixed costs are counted once in total business profit; product display allocates shared overhead by each product's share of revenue."));
  rows.push(p("6. Competitive Positioning", "Heading1"));
  rows.push(p(`Main competitor findings: ${evaluation.competitiveSummary}`));
  rows.push(p(`Preliminary range: ${profile.pricingRange?`${money(profile.pricingRange[0])}–${money(profile.pricingRange[1])}`:"Not supplied for this product context"}. Research date: October 27, 2026.`));
  if (profile.competitorFit === "matched" && evaluation.competitorPrices?.length) rows.push(table([["Competitor","Observed representative price","Verification","Source"],...evaluation.competitorPrices.map(c=>[c.name,money(c.price),c.verification||"See Mission 1 dataset",c.url||""])]));
  else rows.push(p("No like-for-like pricing comparison is claimed because the supplied Mission 1 dataset covers a different product category."));
  rows.push(p("7. Pricing Decision Review", "Heading1"));
  rows.push(p(`Overall classification: ${evaluation.classification}. ${evaluation.criteria}`));
  rows.push(p("Financial findings" ,"Heading2")); rows.push(p(evaluation.financialSummary)); rows.push(p(`Sensitivity checks: ${evaluation.sensitivitySummary||"Not available."}`));
  rows.push(p("Strengths", "Heading2")); evaluation.strengths.forEach(x=>rows.push(bullet(x)));
  rows.push(p("Key risks", "Heading2")); evaluation.warnings.forEach(x=>rows.push(bullet(x)));
  rows.push(p("Missing evidence", "Heading2")); evaluation.missingEvidence.forEach(x=>rows.push(bullet(x)));
  rows.push(p("Recommendations", "Heading2")); evaluation.recommendations.forEach(x=>rows.push(bullet(x)));
  rows.push(p(`Warnings acknowledged by student: ${data.review.studentAcknowledgedWarnings?"Yes":"No warnings required acknowledgement"}.`));
  rows.push(p("8. Student Decision Statement", "Heading1")); rows.push(p(data.decisionStatement));
  rows.push(p("9. Sources and Limitations", "Heading1"));
  rows.push(p(`The selected market research was checked October 27, 2026. Supplier and processor prices are published references, not quotes for the venture's chosen SKU, channel, or account. Student-Entered, Estimated, Illustrative, and Unpriced risk lines remain assumptions, not verified industry averages.`));
  for (const src of data.sourcesAndLimitations.benchmarkSources || []) rows.push(bullet(`${src.label}: ${src.value} | ${src.url} | checked ${src.checked} | ${src.status}`));
  for (const limitation of data.sourcesAndLimitations.limitations) rows.push(bullet(limitation));
  rows.push(p("10. Confirmation Record", "Heading1"));
  rows.push(p(`Confirmed on ${fmtDate(data.confirmation.confirmedAt)}. Evaluation status: ${data.confirmation.evaluationStatus}. Confirmation status: ${data.confirmation.confirmationStatus}.`));
  rows.push(table([["Confirmed product","Final price","Billing model"],...data.confirmation.confirmedPrices.map(p=>[p.name,money(p.price),p.pricingModel])]));
  rows.push(p(`Warnings acknowledged: ${data.confirmation.warningsAcknowledged?"Yes":"No"}.`));
  rows.push(p("End of confirmed decision snapshot", "Caption"));

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${rows.join("")}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="900" w:right="960" w:bottom="900" w:left="960" w:header="450" w:footer="450" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="20"/><w:color w:val="263635"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="280" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:spacing w:after="120"/></w:pPr><w:rPr><w:rFonts w:ascii="Aptos Display" w:hAnsi="Aptos Display"/><w:b/><w:sz w:val="34"/><w:color w:val="000000"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:rPr><w:sz w:val="22"/><w:color w:val="000000"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="260" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:rFonts w:ascii="Aptos Display" w:hAnsi="Aptos Display"/><w:b/><w:sz w:val="26"/><w:color w:val="000000"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="140" w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="22"/><w:color w:val="000000"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="360" w:hanging="180"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="Caption"/><w:rPr><w:i/><w:sz w:val="18"/><w:color w:val="748780"/></w:rPr></w:style></w:styles>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Pricing Decision Report</dc:title><dc:subject>${esc(profile.name)} confirmed pricing snapshot</dc:subject><dc:creator>Pricing &amp; Cost Laboratory</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`;
  const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Ledger Pricing Laboratory</Application></Properties>`;
  return zipStored([
    ["[Content_Types].xml",contentTypes],
    ["_rels/.rels",rootRels],
    ["word/document.xml",documentXml],
    ["word/styles.xml",stylesXml],
    ["word/_rels/document.xml.rels",documentRels],
    ["docProps/core.xml",core],
    ["docProps/app.xml",app]
  ]);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function u16(value) { return [value & 255, (value >>> 8) & 255]; }
function u32(value) { return [value & 255, (value >>> 8)&255, (value>>>16)&255, (value>>>24)&255]; }
function bytesJoin(parts) { const total=parts.reduce((n,p)=>n+p.length,0); const out=new Uint8Array(total); let o=0; for(const part of parts){out.set(part,o);o+=part.length;} return out; }
function zipStored(entries) {
  const encoder = new TextEncoder(); const localParts=[]; const centralParts=[]; let offset=0;
  for(const [filename,content] of entries){
    const name=encoder.encode(filename), data=encoder.encode(content), crc=crc32(data);
    const local=bytesJoin([new Uint8Array([0x50,0x4b,0x03,0x04]),new Uint8Array([...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0)]),name,data]);
    localParts.push(local);
    const central=bytesJoin([new Uint8Array([0x50,0x4b,0x01,0x02]),new Uint8Array([...u16(20),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset)]),name]);
    centralParts.push(central); offset+=local.length;
  }
  const centralDir=bytesJoin(centralParts); const local=bytesJoin(localParts); const end=bytesJoin([new Uint8Array([0x50,0x4b,0x05,0x06]),new Uint8Array([...u16(0),...u16(0),...u16(entries.length),...u16(entries.length),...u32(centralDir.length),...u32(local.length),...u16(0)])]);
  return bytesJoin([local,centralDir,end]);
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob); const anchor=document.createElement("a"); anchor.href=url; anchor.download=filename; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(()=>URL.revokeObjectURL(url),2000);
}

export function reportModelForTest(profile, state, evaluation, website) {
  return buildConfirmedExport(state, profile, evaluation, "Test justification: evaluated costs and alternatives.", true, website);
}
