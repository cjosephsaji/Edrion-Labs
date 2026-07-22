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
  fieldsSchema?: Record<string, unknown>;
  appliesToTypes: string[];
  platformTemplateKey?: string;
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
    docType: 'fee_receipt',
    name: 'Fee receipt',
    html: `<div class="receipt"><h2>FEE RECEIPT</h2><p class="number">{{receipt.number}}</p><table><tr><th>Invoice</th><th>Amount</th></tr>{{#each receipt.lines}}<tr><td>{{this.invoiceNo}}</td><td>{{this.amountMinor}}</td></tr>{{/each}}</table><p><b>Amount received:</b> {{receipt.amount_minor}}</p><p><b>Method:</b> {{receipt.method}}</p><p class="note">This computer-generated receipt is the permanent payment record.</p></div>`,
    css: `.receipt h2 { text-align:center; } .number { text-align:center; font-size:16pt; font-weight:bold; } .receipt table { width:100%; border-collapse:collapse; } .receipt th,.receipt td { border:1px solid #ddd; padding:8px; } .receipt .note { margin-top:32px; color:#555; font-size:9pt; }`,
    headerConfig: { logoPosition: 'center', showInstitutionName: true },
    appliesToTypes: [],
  },
  {
    docType:'fee_statement',name:'Fee statement',
    html:`<div class="statement"><h2>FEE STATEMENT</h2><p><b>{{student.name}}</b></p><table><tr><th>Invoice</th><th>Billed</th><th>Paid</th><th>Balance</th><th>Status</th></tr>{{#each invoices}}<tr><td>{{this.number}}</td><td>{{this.amount_minor}}</td><td>{{this.paid_minor}}</td><td>{{this.balance_minor}}</td><td>{{this.status}}</td></tr>{{/each}}</table><p class="closing"><b>Closing balance:</b> {{closing_balance_minor}}</p></div>`,
    css:`.statement h2{text-align:center}.statement table{width:100%;border-collapse:collapse}.statement th,.statement td{border:1px solid #ddd;padding:7px;text-align:right}.statement th:first-child,.statement td:first-child{text-align:left}.closing{margin-top:20px;text-align:right}`,
    headerConfig:{logoPosition:'center',showInstitutionName:true},appliesToTypes:[],
  },
  {
    docType: 'bonafide',
    name: 'Bonafide certificate',
    html: `<div class="cert"><h2>BONAFIDE CERTIFICATE</h2><p>This is to certify that <b>{{student.full_name}}</b>, admission number <b>{{student.admission_no}}</b>, is a bona fide learner of this institution.</p><p>This certificate is issued for {{purpose_label}}{{#if purpose_text}} — {{purpose_text}}{{/if}}.</p><div class="verify"><img src="{{{issue.verify_qr_data_url}}}" alt="Verification QR"><div>Verification code: {{issue.verify_code}}<br><span>{{issue.verify_url}}</span></div></div><div class="sign"><div>{{issue.role_label}}</div></div></div>`,
    css: `.cert { margin-top: 30px; line-height: 1.7; } .cert h2 { text-align: center; } .verify { margin-top: 32px; display: flex; align-items: center; gap: 12px; font-family: monospace; font-size: 9pt; } .verify img { width: 84px; height: 84px; } .sign { margin-top: 60px; text-align: right; }`,
    fieldsSchema: { student: ['full_name', 'admission_no'], purpose_label: 'string', purpose_text: 'string', issue: ['verify_code', 'verify_url', 'verify_qr_data_url', 'role_label'] },
    headerConfig: { logoPosition: 'center', showInstitutionName: true },
    appliesToTypes: [],
  },
  {
    docType: 'transcript',
    name: 'Academic transcript',
    html: `<div class="transcript"><h2>ACADEMIC TRANSCRIPT</h2><p><b>{{student.full_name}}</b> · {{student.admission_no}}</p><div>{{academic.summary}}</div><div class="verify"><img src="{{{issue.verify_qr_data_url}}}" alt="Verification QR"><div>Verification code: {{issue.verify_code}}<br><span>{{issue.verify_url}}</span></div></div><div class="sign"><div>{{issue.role_label}}</div></div></div>`,
    css: `.transcript { margin-top: 24px; line-height: 1.6; } .transcript h2 { text-align: center; } .verify { margin-top: 32px; display: flex; align-items: center; gap: 12px; font-family: monospace; font-size: 9pt; } .verify img { width: 84px; height: 84px; } .sign { margin-top: 60px; text-align: right; }`,
    fieldsSchema: { student: ['full_name', 'admission_no'], academic: ['summary'], issue: ['verify_code', 'verify_url', 'verify_qr_data_url', 'role_label'] },
    headerConfig: { logoPosition: 'center', showInstitutionName: true },
    appliesToTypes: ['college', 'university', 'training_center'],
  },
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
  {
    docType: 'report_card',
    name: 'CBSE report card',
    platformTemplateKey: 'report_card.cbse',
    html: `<div class="rc"><h2>REPORT CARD</h2><p><b>{{student.name}}</b> · {{student.regNo}} · {{term.label}}</p><table class="marks"><tr><th>Subject</th><th>Marks</th><th>Grade</th></tr>{{#each subjects}}<tr><td>{{this.name}}</td><td>{{this.marks}}</td><td>{{this.grade}}</td></tr>{{/each}}</table>{{#if aggregate.gpa}}<p class="gpa">GPA: {{aggregate.gpa}}</p>{{/if}}{{#if remarks}}<p class="remarks"><b>Remarks:</b> {{remarks}}</p>{{/if}}</div>`,
    css: `.rc h2{text-align:center}.marks{width:100%;border-collapse:collapse;margin-top:16px}.marks th,.marks td{border:1px solid #ccc;padding:6px}.gpa{text-align:right;font-weight:bold;margin-top:12px}.remarks{margin-top:20px}`,
    headerConfig: {
      logoPosition: 'center',
      showInstitutionName: true,
      reportOptions: { showClassAverage: true, showRank: false, attendanceBlock: true, remarksSource: 'class_teacher' },
      signatureSlots: [
        { slotKey: 'class_teacher', label: 'Class teacher', mode: 'sign_step', signRole: 'class_teacher', order: 0 },
        { slotKey: 'principal', label: 'Principal', mode: 'sign_step', signRole: 'principal', order: 1 },
      ],
    },
    appliesToTypes: ['school'],
  },
  {
    docType: 'report_card',
    name: 'State simple report card',
    platformTemplateKey: 'report_card.state_simple',
    html: `<div class="rc simple"><h2>PROGRESS REPORT</h2><p>{{student.name}} · Class {{student.className}}</p><table>{{#each subjects}}<tr><td>{{this.name}}</td><td>{{this.marks}}/{{this.max}}</td></tr>{{/each}}</table></div>`,
    css: `.rc.simple table{width:100%;margin-top:12px;border-collapse:collapse}.rc.simple td{border-bottom:1px solid #ddd;padding:6px}`,
    headerConfig: { logoPosition: 'left', reportOptions: { showRank: false, attendanceBlock: true } },
    appliesToTypes: ['school'],
  },
  {
    docType: 'report_card',
    name: 'US transcript-style report',
    platformTemplateKey: 'report_card.us_transcript',
    html: `<div class="us"><h2>REPORT OF PROGRESS</h2><p>{{student.name}} · ID {{student.regNo}}</p><table><tr><th>Course</th><th>Credits</th><th>Grade</th></tr>{{#each subjects}}<tr><td>{{this.name}}</td><td>{{this.credits}}</td><td>{{this.grade}}</td></tr>{{/each}}</table><p><b>Term GPA:</b> {{aggregate.gpa}}</p></div>`,
    css: `.us table{width:100%;border-collapse:collapse}.us th,.us td{border:1px solid #999;padding:6px}`,
    headerConfig: { logoPosition: 'center', reportOptions: { showClassAverage: false, showRank: true } },
    appliesToTypes: ['college', 'university'],
  },
];
