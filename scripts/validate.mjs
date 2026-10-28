import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculateModel, modelIntegrityCheck, createInitialState, evaluateRisk, saveCurrentScenarioValues, annualizedAmount } from '../model.js';
import { buildConfirmedExport, buildReportDocument, reportModelForTest } from '../report.js';
const profiles = JSON.parse(await readFile(new URL('../venture_profiles.json', import.meta.url)));
const competitors = JSON.parse(await readFile(new URL('../competitor_data.json', import.meta.url)));
assert.deepEqual(modelIntegrityCheck().filter(([,ok])=>!ok), []);
for (const [id,profile] of Object.entries(profiles.profiles)) {
 const state=createInitialState(profiles,id); state.contextAcknowledged=true;
 const base=calculateModel(state); assert(base.products.length>=1); assert(base.totalCosts>=0);
 state.products[0].price=0; const zero=calculateModel(state); assert.equal(zero.breakEvenUnits,null);
 state.products[0].price=base.products[0].variablePerUnit-1; const loss=calculateModel(state); assert.equal(loss.breakEvenUnits,null);
}
const tee=createInitialState(profiles,'nara-tee'); const teeReview=evaluateRisk(tee,profiles.profiles['nara-tee'],competitors); assert(teeReview.warnings.some(x=>x.includes('different product category')));
const mat=createInitialState(profiles,'quickfold-mat'); const matReview=evaluateRisk(mat,profiles.profiles['quickfold-mat'],competitors); assert.equal(matReview.competitorPrices.length,4); assert(matReview.sources.length>=1);
const annual={enabled:true,timing:'recurring',classification:'fixed',frequency:'annual',amount:120}; assert.equal(annualizedAmount(annual),120);
const weekly={...annual,frequency:'weekly',amount:12}; assert.equal(annualizedAmount(weekly),624);
const shared=calculateModel({...tee,products:[...tee.products,{...tee.products[0],id:'p2',price:40,salesPerMonth:10}],expenses:tee.expenses});
assert(Number.isFinite(shared.operatingProfit));
const exportState=createInitialState(profiles,'nara-tee'); exportState.contextAcknowledged=true;
const review=evaluateRisk(exportState,profiles.profiles['nara-tee'],competitors);
const report=reportModelForTest(profiles.profiles['nara-tee'],exportState,review,{repositoryUrl:profiles.profiles['nara-tee'].repositoryUrl,liveUrl:profiles.profiles['nara-tee'].liveUrl});
assert.equal(report.data.confirmation.confirmed,true); assert.equal(JSON.parse(JSON.stringify(report.data)).venture.name,'Google Nara Tee'); assert(report.data.sourcesAndLimitations.benchmarkSources.length>=1); assert(report.evaluation.sensitivitySummary);
const doc=buildReportDocument(report); assert.equal(new TextDecoder().decode(doc.slice(0,2)),'PK');
await (await import('node:fs/promises')).writeFile('/private/tmp/mission3-test-report.docx',doc);
await (await import('node:fs/promises')).writeFile('/private/tmp/mission3-test-export.json',JSON.stringify(report.data,null,2));
console.log('Financial, profile, pricing-period, risk-context, JSON, and DOCX header checks passed.');
