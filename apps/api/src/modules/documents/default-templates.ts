/**
 * Seeded platform-default document templates (institution_id NULL). One generic template per
 * doc_type; college/university variants only where terminology differs. Institutions override
 * them in Settings → Documents without a deploy (Handlebars-in-DB).
 */
export interface DefaultTemplateSeed {
  docType: string;
  name: string;
  html: string;
  css: string;
  headerConfig: Record<string, unknown>;
  appliesToTypes: string[];
}

const examMeta = `
<table class="meta">
  <tr>
    {{#if header.showDate}}<td><b>{{#if header.labels.date}}{{header.labels.date}}{{else}}Date{{/if}}:</b> {{date}}</td>{{/if}}
    {{#if header.showDuration}}<td><b>Duration:</b> {{duration}}</td>{{/if}}
    {{#if header.showMaxMarks}}<td><b>Max marks:</b> {{maxMarks}}</td>{{/if}}
    {{#if header.showExaminer}}<td><b>Examiner:</b> {{examiner}}</td>{{/if}}
  </tr>
</table>
{{#if header.instructions}}<div class="instructions"><b>Instructions:</b> {{header.instructions}}</div>{{/if}}`;

const questionList = `
<ol class="questions">
  {{#each questions}}
  <li><div class="q">{{this.text}} {{#if this.marks}}<span class="marks">[{{this.marks}}]</span>{{/if}}</div>
  {{#if this.options}}<ol type="a">{{#each this.options}}<li>{{this}}</li>{{/each}}</ol>{{/if}}</li>
  {{/each}}
</ol>`;

export const PLATFORM_DEFAULT_TEMPLATES: DefaultTemplateSeed[] = [
  {
    docType: 'exam_paper',
    name: 'Standard exam paper',
    html: `<div class="paper-meta"><b>{{subject}}</b>{{#if className}} — {{className}}{{/if}}</div>${examMeta}${questionList}`,
    css: `.meta td { border: none; padding: 2px 12px 2px 0; } .instructions { margin: 8px 0 16px; font-size: 10pt; } .questions li { margin-bottom: 12px; } .marks { float: right; font-weight: bold; }`,
    headerConfig: { logoPosition: 'center', showDate: true, showDuration: true, showMaxMarks: true },
    appliesToTypes: [],
  },
  {
    docType: 'assignment',
    name: 'Standard assignment sheet',
    html: `<div class="paper-meta"><b>{{subject}}</b>{{#if className}} — {{className}}{{/if}} {{#if dueDate}}<span style="float:right">Due: {{date dueDate}}</span>{{/if}}</div><div class="body">{{instructions}}</div>${questionList}`,
    css: `.body { margin: 12px 0; } .questions li { margin-bottom: 10px; }`,
    headerConfig: { logoPosition: 'left', showDate: true },
    appliesToTypes: [],
  },
  {
    docType: 'circular',
    name: 'Official circular',
    html: `<div class="circ-no">Circular No: {{circularNo}} &nbsp;&nbsp; Date: {{date}}</div><div class="salutation">{{salutation}}</div><div class="body">{{{paragraphsHtml}}}{{#unless paragraphsHtml}}{{body}}{{/unless}}</div><div class="sign"><div>{{signatoryName}}</div><div>{{signatoryTitle}}</div></div>`,
    css: `.circ-no { text-align: right; font-size: 10pt; margin-bottom: 16px; } .salutation { margin-bottom: 10px; } .body { white-space: pre-wrap; } .sign { margin-top: 40px; text-align: right; }`,
    headerConfig: { logoPosition: 'center', showInstitutionName: true },
    appliesToTypes: [],
  },
  {
    docType: 'certificate',
    name: 'Standard certificate',
    html: `<div class="cert"><p>This is to certify that</p><div class="cert-name">{{recipientName}}</div><p>{{body}}</p><div class="sign"><div>{{signatoryName}}</div><div>{{signatoryTitle}}</div></div></div>`,
    css: `.cert { text-align: center; margin-top: 30px; } .cert-name { font-size: 20pt; font-weight: bold; margin: 16px 0; text-decoration: underline; } .sign { margin-top: 60px; text-align: right; }`,
    headerConfig: { logoPosition: 'center' },
    appliesToTypes: [],
  },
  {
    docType: 'letter',
    name: 'Letter on letterhead',
    html: `<div class="date">Date: {{date}}</div><div class="to">{{toBlock}}</div><div class="subject"><b>Subject:</b> {{subject}}</div><div class="body">{{body}}</div><div class="sign"><div>{{signatoryName}}</div><div>{{signatoryTitle}}</div></div>`,
    css: `.date { text-align: right; } .to { margin: 14px 0; white-space: pre-wrap; } .subject { margin-bottom: 12px; } .body { white-space: pre-wrap; } .sign { margin-top: 40px; }`,
    headerConfig: { logoPosition: 'left' },
    appliesToTypes: [],
  },
  {
    docType: 'report',
    name: 'Standard report',
    html: `<div class="body">{{{tableHtml}}}{{#unless tableHtml}}{{body}}{{/unless}}</div>{{#if chartSvg}}<div class="chart">{{{chartSvg}}}</div>{{/if}}`,
    css: `.chart { margin-top: 20px; text-align: center; }`,
    headerConfig: { logoPosition: 'left', showDate: true },
    appliesToTypes: [],
  },
];
