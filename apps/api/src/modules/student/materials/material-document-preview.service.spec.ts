import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { MaterialDocumentPreviewService } from './material-document-preview.service';

const previews = new MaterialDocumentPreviewService();

describe('MaterialDocumentPreviewService', () => {
  it('uses verified extracted pages for any Office generation', async () => {
    const result = await previews.create({
      filename: 'lecture.doc',
      mimeType: 'application/msword',
      buffer: Buffer.from('binary source'),
      extractedPages: [
        { pageIndex: 0, text: 'Introduction to cloud computing' },
        { pageIndex: 1, text: 'Deployment models and examples' },
      ],
    });

    expect(result.format).toBe('word');
    expect(result.sections).toEqual([
      { title: 'Page 1', text: 'Introduction to cloud computing', rows: null },
      { title: 'Page 2', text: 'Deployment models and examples', rows: null },
    ]);
  });

  it('extracts readable text from DOCX files', async () => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
    zip.file('_rels/.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
    zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Cloud service models</w:t></w:r></w:p><w:p><w:r><w:t>IaaS, PaaS, and SaaS</w:t></w:r></w:p></w:body></w:document>`);

    const result = await previews.create({
      filename: 'cloud.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: await zip.generateAsync({ type: 'nodebuffer' }),
    });

    expect(result.format).toBe('word');
    expect(result.sections[0]?.text).toContain('Cloud service models');
    expect(result.sections[0]?.text).toContain('IaaS, PaaS, and SaaS');
  });

  it('turns PPTX slides into separate preview pages', async () => {
    const zip = new JSZip();
    zip.file('ppt/slides/slide2.xml', slideXml('Second slide', 'Elasticity'));
    zip.file('ppt/slides/slide1.xml', slideXml('First slide', 'Virtualization'));

    const result = await previews.create({
      filename: 'lecture.pptx',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      buffer: await zip.generateAsync({ type: 'nodebuffer' }),
    });

    expect(result.format).toBe('slides');
    expect(result.sections.map((section) => section.title)).toEqual(['Slide 1', 'Slide 2']);
    expect(result.sections[0]?.text).toContain('Virtualization');
    expect(result.sections[1]?.text).toContain('Elasticity');
  });

  it('renders XLSX sheets and quoted CSV as tables', async () => {
    const zip = new JSZip();
    zip.file('xl/workbook.xml', `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="Marks" sheetId="1"/></sheets></workbook>`);
    zip.file('xl/sharedStrings.xml', `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Student</t></si><si><t>Score</t></si><si><t>Alex</t></si></sst>`);
    zip.file('xl/worksheets/sheet1.xml', `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>87</v></c></row></sheetData></worksheet>`);

    const spreadsheet = await previews.create({
      filename: 'marks.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: await zip.generateAsync({ type: 'nodebuffer' }),
    });
    const csv = await previews.create({
      filename: 'marks.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('Student,Comment\nAlex,"Clear, complete answer"'),
    });

    expect(spreadsheet.sections[0]).toMatchObject({
      title: 'Marks',
      rows: [['Student', 'Score'], ['Alex', '87']],
    });
    expect(csv.sections[0]?.rows).toEqual([
      ['Student', 'Comment'],
      ['Alex', 'Clear, complete answer'],
    ]);
  });

  it('extracts readable strings from legacy Word, PowerPoint, and Excel binaries', async () => {
    for (const [filename, mimeType, expectedFormat] of [
      ['notes.doc', 'application/msword', 'word'],
      ['slides.ppt', 'application/vnd.ms-powerpoint', 'slides'],
      ['results.xls', 'application/vnd.ms-excel', 'spreadsheet'],
    ] as const) {
      const buffer = Buffer.concat([
        Buffer.from([0xd0, 0xcf, 0x11, 0xe0]),
        Buffer.from('Legacy document preview content', 'utf16le'),
      ]);
      const result = await previews.create({ filename, mimeType, buffer });
      expect(result.format).toBe(expectedFormat);
      expect(result.sections[0]?.text).toContain('Legacy document preview content');
    }
  });

  it('renders Markdown and plain text without treating their contents as HTML', async () => {
    for (const filename of ['lesson.md', 'lesson.txt']) {
      const result = await previews.create({
        filename,
        mimeType: 'text/plain',
        buffer: Buffer.from('# Topic\n<script>alert(1)</script>\nReadable notes'),
      });
      expect(result.format).toBe('text');
      expect(result.sections[0]?.text).toContain('<script>alert(1)</script>');
    }
  });
});

function slideXml(title: string, body: string) {
  return `<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><a:p><a:r><a:t>${title}</a:t></a:r></a:p><a:p><a:r><a:t>${body}</a:t></a:r></a:p></p:cSld></p:sld>`;
}
