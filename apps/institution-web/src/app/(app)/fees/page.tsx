'use client';
/* eslint-disable react-hooks/exhaustive-deps -- compact legacy tabs list their closure inputs directly */
import { useEffect, useMemo, useState } from 'react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type FilterDef, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { InvoicePaymentsPanel } from '@/components/fees/invoice-payments-panel';
import { useAcademicYearOptions, useClassOptions, useGradeLevelOptions } from '@/lib/academics';
import { useStudentOptions, studentRowSelectOptions } from '@/lib/people';
import { useFeesList, useFeesMutations, useFeeStructureOptions } from '@/lib/fees';
import { useFormat } from '@/lib/format';
import { useProgrammeFacetFilters } from '@/lib/programme-facets';
import { useTerm } from '@/lib/term';
import type { FeeInvoiceRow, FeeStructureRow } from '@/lib/fees-types';
import { formatPortalError, usePortalClient } from '@/lib/portal-client';
import { useScope } from '@/lib/scope';

const PERMISSIONS: ResourcePermissions = {
  view: 'fees.view',
  create: 'fees.manage',
  update: 'fees.manage',
  delete: 'fees.manage',
};

const FEE_TYPES = [
  { value: 'tuition', label: 'Tuition' },
  { value: 'admission', label: 'Admission' },
  { value: 'transport', label: 'Transport' },
  { value: 'hostel', label: 'Hostel' },
  { value: 'exam', label: 'Exam' },
  { value: 'library', label: 'Library' },
  { value: 'misc', label: 'Misc' },
];
const FREQUENCIES = [
  { value: 'one_time', label: 'One time' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'term', label: 'Term' },
  { value: 'annual', label: 'Annual' },
];
const STRUCTURE_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];
const INVOICE_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'partial', label: 'Partial' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'cancelled', label: 'Cancelled' },
];
const label = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? v;

type VersionLine={key:string;label:string;category:string;amount_minor:number;tax_pct:number};
type VersionInstallment={seq:number;label:string;due_date:string;pct_bps:number};
type StructureVersionDetail={structure:FeeStructureRow;versions:Array<{versionNo:number;lineItems:VersionLine[];installmentSchedule:VersionInstallment[];lateFeePolicy:{mode:string;amount_minor?:number;grace_days:number;cap_minor?:number|null}}>};

function StructureVersionComposer(){
  const client=usePortalClient();const{scope}=useScope();const{data:structures}=useFeeStructureOptions();const{data:students}=useStudentOptions();
  const[selected,setSelected]=useState('');const[detail,setDetail]=useState<StructureVersionDetail>();const[lines,setLines]=useState<VersionLine[]>([]);const[installments,setInstallments]=useState<VersionInstallment[]>([]);const[lateMode,setLateMode]=useState('none');const[lateAmount,setLateAmount]=useState(0);const[grace,setGrace]=useState(0);const[cohort,setCohort]=useState<string[]>([]);const[message,setMessage]=useState('');const[busy,setBusy]=useState(false);const[generationReport,setGenerationReport]=useState('');
  async function load(id:string){setSelected(id);setMessage('');if(!id){setDetail(undefined);return;}try{const data=await client.get<StructureVersionDetail>(`/portal/fees/structures/${id}/versions`,scope);setDetail(data);const current=data.versions[0];setLines(current?.lineItems??[{key:'legacy',label:data.structure.name,category:data.structure.feeType==='admission'?'other':data.structure.feeType,amount_minor:data.structure.amount,tax_pct:0}]);setInstallments(current?.installmentSchedule??[{seq:1,label:'Full payment',due_date:new Date().toISOString().slice(0,10),pct_bps:10000}]);setLateMode(current?.lateFeePolicy?.mode??'none');setLateAmount(current?.lateFeePolicy?.amount_minor??0);setGrace(current?.lateFeePolicy?.grace_days??0);}catch(e){setMessage(formatPortalError(e,"Couldn't load this structure."));}}
  const pct=installments.reduce((sum,row)=>sum+row.pct_bps,0);const total=lines.reduce((sum,row)=>sum+row.amount_minor,0);
  async function saveVersion(){if(!detail||pct!==10000)return;setBusy(true);setMessage('');try{const result=await client.post<{versionNo:number;regeneration:{cancelled:number}}>(`/portal/fees/structures/${selected}/versions`,scope,{version:detail.structure.version,line_items:lines,installment_schedule:installments,late_fee_policy:{mode:lateMode,amount_minor:lateMode==='flat'?lateAmount:undefined,pct_bps:lateMode==='percent'?lateAmount:undefined,per_day_minor:lateMode==='per_day'?lateAmount:undefined,grace_days:grace,cap_minor:null},regenerate_unbilled:true});setMessage(`Version ${result.versionNo} saved · ${result.regeneration.cancelled} unbilled invoice${result.regeneration.cancelled===1?'':'s'} replaced.`);await load(selected);}catch(e){setMessage(formatPortalError(e,"Couldn't save — nothing was changed."));}finally{setBusy(false);}}
  async function activate(){if(!detail||pct!==10000)return;setBusy(true);try{await client.post(`/portal/fees/structures/${selected}/activate`,scope,{version:detail.structure.version});setMessage('Structure activated.');await load(selected);}catch(e){setMessage(formatPortalError(e,"Couldn't activate this structure."));}finally{setBusy(false);}}
  async function generate(){if(!detail||!cohort.length)return;setBusy(true);setGenerationReport('');try{const result=await client.request<{batchId:string;status:string;created:number;skipped:number;expected:number;chunkCount:number}>(`/portal/fees/structures/${selected}/generate`,scope,{method:'POST',headers:{'idempotency-key':crypto.randomUUID()},body:JSON.stringify({version_no:detail.structure.currentVersion,installment_seqs:installments.map(row=>row.seq),student_ids:cohort})});if(result.status==='complete'){setMessage(`${result.created} invoices created · ${result.skipped} already billed.`);setGenerationReport(result.batchId);return;}setMessage(`Invoice generation started · 0 of ${result.expected} checked.`);for(let attempt=0;attempt<180;attempt+=1){await new Promise(resolve=>window.setTimeout(resolve,1000));const progress=await client.get<{status:string;created:number;skipped:number;expected:number;completedChunks:number;chunkCount:number}>(`/portal/fees/generation-batches/${result.batchId}`,scope);setMessage(progress.status==='complete'?`${progress.created} invoices created · ${progress.skipped} already billed.`:`Generating invoices · ${progress.completedChunks}/${progress.chunkCount} batches complete · ${progress.created} created.`);if(progress.status==='complete'){setGenerationReport(result.batchId);break;}}}catch(e){setMessage(formatPortalError(e,"Couldn't generate invoices."));}finally{setBusy(false);}}
  return <section className="mx-auto my-8 max-w-6xl rounded-xl border border-border bg-surface p-5"><h2 className="text-lg font-semibold">Structure composer & invoice generation</h2><p className="mt-1 text-sm text-text-muted">Select a structure to edit its line items, installments and late-fee policy. Editing creates a new version; billed invoices never change.</p><select value={selected} onChange={e=>void load(e.target.value)} className="mt-4 w-full rounded-md border border-border px-3 py-2"><option value="">Select a structure</option>{structures?.items.map(row=><option key={row.id} value={row.id}>{row.name} · v{row.currentVersion??1}</option>)}</select>{message&&<div className="mt-3 rounded-md bg-surface-muted p-3 text-sm"><p>{message}</p>{generationReport&&<a href={client.fileUrl(`/portal/fees/generation-batches/${generationReport}/report.csv`)} className="mt-2 inline-block font-semibold text-primary">Download CSV report</a>}</div>}{detail&&<div className="mt-5 space-y-6"><div><div className="flex items-center justify-between"><h3 className="font-medium">Line items</h3><span className="text-sm font-semibold">Total {(total/100).toFixed(2)}</span></div><div className="mt-2 space-y-2">{lines.map((row,index)=><div key={`${row.key}:${index}`} className="grid gap-2 sm:grid-cols-[1fr_150px_140px_90px_auto]"><input aria-label="Line item label" value={row.label} onChange={e=>setLines(lines.map((item,i)=>i===index?{...item,label:e.target.value}:item))} className="rounded-md border border-border px-3 py-2"/><select value={row.category} onChange={e=>setLines(lines.map((item,i)=>i===index?{...item,category:e.target.value}:item))} className="rounded-md border border-border px-3 py-2">{['tuition','exam','lab','transport','hostel','other'].map(value=><option key={value}>{value}</option>)}</select><input aria-label="Amount" type="number" min={0} value={row.amount_minor/100} onChange={e=>setLines(lines.map((item,i)=>i===index?{...item,amount_minor:Math.round(Number(e.target.value)*100)}:item))} className="rounded-md border border-border px-3 py-2"/><input aria-label="Tax percent" type="number" min={0} max={100} value={row.tax_pct} onChange={e=>setLines(lines.map((item,i)=>i===index?{...item,tax_pct:Number(e.target.value)}:item))} className="rounded-md border border-border px-3 py-2"/><button type="button" onClick={()=>setLines(lines.filter((_,i)=>i!==index))} className="px-2 text-sm text-red-700">Remove</button></div>)}</div><button type="button" onClick={()=>setLines([...lines,{key:crypto.randomUUID(),label:'New item',category:'other',amount_minor:0,tax_pct:0}])} className="mt-2 text-sm font-medium text-primary">+ Add line item</button></div><div><div className="flex items-center justify-between"><h3 className="font-medium">Installments</h3><span className={`text-sm font-semibold ${pct===10000?'text-green-700':'text-amber-700'}`}>{(pct/100).toFixed(0)}% {pct===10000?'✓':'— must equal 100%'}</span></div><div className="mt-2 space-y-2">{installments.map((row,index)=><div key={row.seq} className="grid gap-2 sm:grid-cols-[1fr_170px_120px_auto]"><input value={row.label} onChange={e=>setInstallments(installments.map((item,i)=>i===index?{...item,label:e.target.value}:item))} className="rounded-md border border-border px-3 py-2"/><input type="date" value={row.due_date} onChange={e=>setInstallments(installments.map((item,i)=>i===index?{...item,due_date:e.target.value}:item))} className="rounded-md border border-border px-3 py-2"/><input aria-label="Installment percent" type="number" min={0.01} max={100} step={0.01} value={row.pct_bps/100} onChange={e=>setInstallments(installments.map((item,i)=>i===index?{...item,pct_bps:Math.round(Number(e.target.value)*100)}:item))} className="rounded-md border border-border px-3 py-2"/><button type="button" onClick={()=>setInstallments(installments.filter((_,i)=>i!==index).map((item,i)=>({...item,seq:i+1})))} className="px-2 text-sm text-red-700">Remove</button></div>)}</div><button type="button" onClick={()=>setInstallments([...installments,{seq:installments.length+1,label:`Installment ${installments.length+1}`,due_date:new Date().toISOString().slice(0,10),pct_bps:0}])} className="mt-2 text-sm font-medium text-primary">+ Add installment</button></div><div className="grid gap-3 sm:grid-cols-3"><label className="text-sm">Late fee<select value={lateMode} onChange={e=>setLateMode(e.target.value)} className="mt-1 w-full rounded-md border border-border px-3 py-2">{['none','flat','percent','per_day'].map(value=><option key={value}>{value}</option>)}</select></label><label className="text-sm">Amount / basis points<input type="number" min={0} disabled={lateMode==='none'} value={lateAmount} onChange={e=>setLateAmount(Number(e.target.value))} className="mt-1 w-full rounded-md border border-border px-3 py-2"/></label><label className="text-sm">Grace days<input type="number" min={0} max={90} value={grace} onChange={e=>setGrace(Number(e.target.value))} className="mt-1 w-full rounded-md border border-border px-3 py-2"/></label></div><div className="flex flex-wrap gap-2"><button disabled={busy||pct!==10000||!lines.length} onClick={()=>void saveVersion()} className="rounded-md bg-primary px-4 py-2 font-medium text-white disabled:opacity-50">Save new version</button><button disabled={busy||pct!==10000} onClick={()=>void activate()} className="rounded-md border border-border px-4 py-2 font-medium disabled:opacity-50">Activate</button></div><div className="border-t border-border pt-5"><h3 className="font-medium">Generate invoices</h3><p className="text-sm text-text-muted">Choose the students to bill from the current version.</p><div className="mt-3 max-h-48 overflow-auto rounded-md border border-border p-2">{students?.items.map(student=><label key={student.id} className="flex items-center gap-2 px-2 py-1 text-sm"><input type="checkbox" checked={cohort.includes(student.id)} onChange={e=>setCohort(e.target.checked?[...cohort,student.id]:cohort.filter(id=>id!==student.id))}/><span>{student.firstName} {student.lastName} · {student.admissionNo}</span></label>)}</div><button disabled={busy||!cohort.length} onClick={()=>void generate()} className="mt-3 rounded-md bg-primary px-4 py-2 font-medium text-white disabled:opacity-50">Generate {cohort.length} student{cohort.length===1?'':'s'}</button></div></div>}</section>;
}

function StructuresTab() {
  const fmt = useFormat();
  const { t, tp } = useTerm();
  const facets = useProgrammeFacetFilters();
  const [statusFilter, setStatusFilter] = useState('');
  const [feeTypeFilter, setFeeTypeFilter] = useState('');
  const { data: grades } = useGradeLevelOptions();
  const { data: classes } = useClassOptions(facets.classFilters);
  const { data: years } = useAcademicYearOptions();

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Term 1 Tuition' },
      { name: 'feeType', label: 'Type', type: 'select', required: true, options: FEE_TYPES },
      { name: 'amount', label: 'Amount', type: 'money', required: true, min: 0 },
      { name: 'frequency', label: 'Frequency', type: 'select', required: true, options: FREQUENCIES },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STRUCTURE_STATUSES },
      {
        name: 'gradeLevelId',
        label: t('gradeLevel'),
        type: 'select',
        nullable: true,
        options: (grades?.items ?? []).map((g) => ({ value: g.id, label: g.name })),
      },
      {
        name: 'classId',
        label: t('class'),
        type: 'select',
        nullable: true,
        options: (classes?.items ?? []).map((c) => ({ value: c.id, label: c.name })),
      },
      {
        name: 'academicYearId',
        label: t('academicYear'),
        type: 'select',
        nullable: true,
        options: (years?.items ?? []).map((y) => ({ value: y.id, label: y.name })),
      },
      ...(facets.showFacets
        ? [
            {
              name: 'termId',
              label: t('term'),
              type: 'select' as const,
              nullable: true,
              options: facets.termOptions,
            },
            // The college-wide alternative to the two id pickers above. Each department owns its own
            // "Year 1" and "Semester 1" row, so picking one there charges one department; these two
            // numbers are what those rows share, and so reach every department at once.
            {
              name: 'gradeLevelNumber',
              label: `${t('gradeLevel')} number — all ${tp('department').toLowerCase()}`,
              type: 'number' as const,
              nullable: true,
              min: 0,
              placeholder: 'e.g. 1',
              help: `Charge every ${tp('department').toLowerCase().replace(/s$/, '')}'s ${t('gradeLevel').toLowerCase()} of this number. Leave the ${t('gradeLevel').toLowerCase()} and ${t('term').toLowerCase()} pickers empty when using this.`,
            },
            {
              name: 'termSequence',
              label: `${t('term')} slot — all ${tp('department').toLowerCase()}`,
              type: 'number' as const,
              nullable: true,
              min: 1,
              placeholder: 'e.g. 1',
              help: `Which ${t('term').toLowerCase()} within that ${t('gradeLevel').toLowerCase()} (1 = first). Counts within the ${t('gradeLevel').toLowerCase()}, so an 8-semester programme's ${t('term').toLowerCase()} 5 is ${t('gradeLevel').toLowerCase()} 3, slot 1.`,
            },
          ]
        : []),
      { name: 'description', label: 'Description', type: 'textarea', nullable: true, placeholder: 'Optional' },
    ],
    [grades, classes, years, facets.showFacets, facets.termOptions, t, tp],
  );

  const toolbarFilters = useMemo<FilterDef[]>(
    () => [
      ...facets.filters,
      { key: 'status', label: 'All statuses', options: STRUCTURE_STATUSES },
      { key: 'feeType', label: 'All types', options: FEE_TYPES },
    ],
    [facets.filters],
  );

  const listFilterValues = useMemo(
    () => ({
      ...facets.filterValues,
      status: statusFilter,
      feeType: feeTypeFilter,
    }),
    [facets.filterValues, statusFilter, feeTypeFilter],
  );

  function onListFilterChange(key: string, value: string) {
    if (key === 'status') setStatusFilter(value);
    else if (key === 'feeType') setFeeTypeFilter(value);
    else facets.onFilterChange(key, value);
  }

  const columns = useMemo<Column<FeeStructureRow>[]>(
    () => [
      { key: 'name', header: 'Name', sortable: true, render: (r) => <span className="font-medium">{r.name}</span> },
      { key: 'feeType', header: 'Type', sortable: true, render: (r) => <span className="text-text-muted">{label(FEE_TYPES, r.feeType)}</span> },
      { key: 'amount', header: 'Amount', align: 'right', sortable: true, render: (r) => <span className="tabular-nums">{fmt.money(r.amount)}</span> },
      { key: 'frequency', header: 'Frequency', render: (r) => label(FREQUENCIES, r.frequency) },
      {
        key: 'appliesTo',
        header: 'Applies to',
        render: (r) => {
          if (r.gradeLevelNumber == null && r.termSequence == null) {
            const named = [r.gradeLevelName, r.className, r.termName].filter(Boolean).join(' · ');
            return <span className="text-text-muted">{named || '—'}</span>;
          }
          const slot = [
            r.gradeLevelNumber != null ? `${t('gradeLevel')} ${r.gradeLevelNumber}` : null,
            r.termSequence != null ? `${t('term')} ${r.termSequence}` : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <span>
              {slot}{' '}
              <span className="text-text-muted">· all {tp('department').toLowerCase()}</span>
            </span>
          );
        },
      },
      { key: 'status', header: 'Status', sortable: true, render: (r) => label(STRUCTURE_STATUSES, r.status) },
    ],
    [fmt, t, tp],
  );

  return (
    <><ResourceManager<FeeStructureRow>
      resource="fees/structures"
      title="Fees"
      noun="fee structure"
      columns={columns}
      fields={fields}
      filters={toolbarFilters}
      filterValues={listFilterValues}
      onFilterChange={onListFilterChange}
      defaultSortBy="name"
      permissions={PERMISSIONS}
      useList={useFeesList}
      useMutations={useFeesMutations}
      rowLabel={(r) => r.name}
      toFormValues={(r) => ({
        name: r.name,
        feeType: r.feeType,
        amount: r.amount,
        frequency: r.frequency,
        status: r.status,
        gradeLevelId: r.gradeLevelId ?? '',
        classId: r.classId ?? '',
        academicYearId: r.academicYearId ?? '',
        termId: r.termId ?? '',
        gradeLevelNumber: r.gradeLevelNumber ?? '',
        termSequence: r.termSequence ?? '',
        description: r.description ?? '',
      })}
    /><StructureVersionComposer/></>
  );
}

function InvoicesTab() {
  const fmt = useFormat();
  const { data: students } = useStudentOptions();
  const { data: structures } = useFeeStructureOptions();

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'invoiceNo', label: 'Invoice no.', type: 'text', required: true, placeholder: 'e.g. INV-001' },
      {
        name: 'studentId',
        label: 'Student',
        type: 'select',
        required: true,
        options: studentRowSelectOptions(students?.items),
      },
      {
        name: 'feeStructureId',
        label: 'Fee structure',
        type: 'select',
        nullable: true,
        options: (structures?.items ?? []).map((s) => ({ value: s.id, label: s.name })),
        help: 'Optional — link the charge to a template.',
      },
      { name: 'amount', label: 'Amount', type: 'money', required: true, min: 0 },
      { name: 'status', label: 'Status', type: 'select', required: true, options: INVOICE_STATUSES },
      { name: 'issueDate', label: 'Issue date', type: 'date', nullable: true },
      { name: 'dueDate', label: 'Due date', type: 'date', nullable: true },
      { name: 'notes', label: 'Notes', type: 'textarea', nullable: true, placeholder: 'Optional' },
    ],
    [students, structures],
  );

  const columns = useMemo<Column<FeeInvoiceRow>[]>(
    () => [
      { key: 'invoiceNo', header: 'Invoice', sortable: true, render: (r) => <span className="font-medium">{r.invoiceNo}</span> },
      { key: 'studentName', header: 'Student', render: (r) => r.studentName ?? '—' },
      { key: 'amount', header: 'Billed', align: 'right', sortable: true, render: (r) => <span className="tabular-nums">{fmt.money(r.amount)}</span> },
      { key: 'amountPaid', header: 'Paid', align: 'right', render: (r) => <span className="tabular-nums">{fmt.money(r.amountPaid)}</span> },
      { key: 'balance', header: 'Balance', align: 'right', render: (r) => <span className="tabular-nums font-medium">{fmt.money(r.balance)}</span> },
      { key: 'status', header: 'Status', sortable: true, render: (r) => label(INVOICE_STATUSES, r.status) },
    ],
    [fmt],
  );

  return (
    <ResourceManager<FeeInvoiceRow>
      resource="fees/invoices"
      title="Fees"
      noun="invoice"
      columns={columns}
      fields={fields}
      defaultSortBy="createdAt"
      defaultSortDir="desc"
      permissions={PERMISSIONS}
      useList={useFeesList}
      useMutations={useFeesMutations}
      rowLabel={(r) => `Invoice ${r.invoiceNo}`}
      renderDetailExtra={({ row }) => (
        <InvoicePaymentsPanel
          invoiceId={row.id}
          invoiceNo={row.invoiceNo}
          amount={row.amount}
          amountPaid={row.amountPaid}
          balance={row.balance}
        />
      )}
      toFormValues={(r) => ({
        invoiceNo: r.invoiceNo,
        studentId: r.studentId,
        feeStructureId: r.feeStructureId ?? '',
        amount: r.amount,
        status: r.status,
        issueDate: r.issueDate ?? '',
        dueDate: r.dueDate ?? '',
        notes: r.notes ?? '',
      })}
    />
  );
}

function CollectionsTab(){
  type Account={currency:string;balanceMinor:number;partialPaymentAllowed:boolean;invoices:Array<{id:string;invoiceNo:string;balanceMinor:number;dueDate?:string}>;receipts:Array<{id:string;receiptNo:string;amountMinor:number;status:string;version:number}>};
  const client=usePortalClient();const{scope}=useScope();const[studentId,setStudentId]=useState('');const[candidates,setCandidates]=useState<Array<{id:string;firstName:string;lastName:string;admissionNo:string}>>([]);const[student,setStudent]=useState<Account>();const[amount,setAmount]=useState('');const[method,setMethod]=useState<'cash'|'cheque'|'dd'|'bank_transfer'>('cash');const[reference,setReference]=useState('');const[message,setMessage]=useState('');const[busy,setBusy]=useState(false);const[lastReceipt,setLastReceipt]=useState<{id:string;receiptNo:string}>();
  async function find(id=studentId){setMessage('');try{const data=await client.get<typeof student>(`/portal/fees/students/${id}`,scope);setStudentId(id);setCandidates([]);setStudent(data);setAmount(String((data?.balanceMinor??0)/100));}catch(e){setMessage(formatPortalError(e,'Student fee account not found.'));}}
  async function search(){setMessage('');try{const rows=await client.get<typeof candidates>(`/portal/fees/students?q=${encodeURIComponent(studentId)}`,scope);setCandidates(rows);if(rows.length===1)await find(rows[0]!.id);if(!rows.length)setMessage('No student or receipt matched that search.');}catch(e){setMessage(formatPortalError(e,'Search failed.'));}}
  async function record(){if(!student)return;setBusy(true);setMessage('');try{const result=await client.request<{receipt:{id:string;receiptNo:string}}>(`/portal/fees/payments`,scope,{method:'POST',headers:{'idempotency-key':crypto.randomUUID()},body:JSON.stringify({student_id:studentId,amount_minor:Math.round(Number(amount)*100),method,reference:reference||undefined})});setLastReceipt(result.receipt);setMessage(`Receipt issued · ${result.receipt.receiptNo}${method==='cheque'||method==='dd'?' · pending clearance':''}`);await find();}catch(e){setMessage(formatPortalError(e,'Payment could not be recorded. Nothing was changed.'));}finally{setBusy(false);}}
  async function waiver(invoiceId:string){const amountText=window.prompt('Waiver amount');if(!amountText)return;const reason=window.prompt('Reason (at least 10 characters)');if(!reason)return;try{const result=await client.post<{status:string}>('/portal/fees/waivers',scope,{student_id:studentId,invoice_id:invoiceId,label:'Custom waiver',amount_minor:Math.round(Number(amountText)*100),reason});setMessage(result.status==='pending_second_approval'?'Waiver sent for second approval.':'Waiver applied.');await find();}catch(e){setMessage(formatPortalError(e,'Waiver could not be added.'));}}
  async function refund(receipt:{id:string;amountMinor:number}){const amountText=window.prompt('Refund amount',String(receipt.amountMinor/100));if(!amountText)return;const reason=window.prompt('Reason (at least 10 characters)');if(!reason)return;try{const result=await client.request<{status:string}>(`/portal/fees/receipts/${receipt.id}/refund`,scope,{method:'POST',headers:{'idempotency-key':crypto.randomUUID()},body:JSON.stringify({amount_minor:Math.round(Number(amountText)*100),reason})});setMessage(result.status==='pending_second_approval'?'Refund sent for second approval.':'Refund posted.');await find();}catch(e){setMessage(formatPortalError(e,'Refund could not be posted.'));}}
  return <div className="mx-auto max-w-4xl p-6"><h1 className="text-2xl font-semibold">Collections</h1><p className="mt-1 text-sm text-text-muted">Find a student account, allocate the payment oldest-due-first, and issue a permanent receipt.</p><div className="mt-6 flex gap-2"><input value={studentId} onChange={e=>setStudentId(e.target.value)} placeholder="Name, registration no. or receipt no." className="min-w-0 flex-1 rounded-md border border-border px-3 py-2"/><button onClick={()=>void search()} className="rounded-md bg-primary px-4 py-2 font-medium text-white">Search</button></div>{candidates.length>0&&<div className="mt-2 overflow-hidden rounded-md border border-border">{candidates.map(row=><button key={row.id} onClick={()=>void find(row.id)} className="flex w-full justify-between border-b border-border px-3 py-2 text-left text-sm hover:bg-surface-muted"><span>{row.firstName} {row.lastName}</span><span className="text-text-muted">{row.admissionNo}</span></button>)}</div>}{message&&<div className="mt-4 rounded-md bg-surface-muted p-3 text-sm"><p>{message}</p>{lastReceipt&&<a href={client.fileUrl(`/portal/fees/receipts/${lastReceipt.id}/file`)} target="_blank" rel="noreferrer" className="mt-2 inline-block font-semibold text-primary">Print receipt</a>}</div>}{student&&<div className="mt-5 rounded-lg border border-border bg-surface p-5"><p className="text-sm text-text-muted">Outstanding balance</p><p className="mt-1 text-3xl font-semibold">{new Intl.NumberFormat(undefined,{style:'currency',currency:student.currency}).format(student.balanceMinor/100)}</p><div className="mt-4 space-y-1">{student.invoices.filter(i=>i.balanceMinor>0).map(i=><div key={i.id} className="flex items-center justify-between gap-3 border-t border-border py-2 text-sm"><span className="flex-1">{i.invoiceNo}{i.dueDate?` · due ${i.dueDate}`:''}</span><span>{(i.balanceMinor/100).toFixed(2)}</span><button onClick={()=>void waiver(i.id)} className="font-medium text-primary">Add waiver</button></div>)}</div><div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-sm">Amount<input value={amount} onChange={e=>setAmount(e.target.value)} disabled={!student.partialPaymentAllowed} className="mt-1 w-full rounded-md border border-border px-3 py-2"/>{!student.partialPaymentAllowed&&<span className="mt-1 block text-xs text-text-muted">Partial payments are disabled by policy.</span>}</label><label className="text-sm">Method<select value={method} onChange={e=>setMethod(e.target.value as typeof method)} className="mt-1 w-full rounded-md border border-border px-3 py-2"><option value="cash">Cash</option><option value="cheque">Cheque</option><option value="dd">DD</option><option value="bank_transfer">Bank transfer</option></select></label><label className="text-sm sm:col-span-2">Reference<input value={reference} onChange={e=>setReference(e.target.value)} className="mt-1 w-full rounded-md border border-border px-3 py-2"/></label></div><button disabled={busy} onClick={()=>void record()} className="mt-4 rounded-md bg-primary px-4 py-2 font-medium text-white disabled:opacity-50">{busy?'Recording…':'Record & issue receipt'}</button>{student.receipts.length>0&&<div className="mt-6 border-t border-border pt-4"><h3 className="font-medium">Recent receipts</h3>{student.receipts.map(row=><div key={row.id} className="mt-2 flex items-center justify-between text-sm"><span className={row.status==='cancelled'?'line-through opacity-60':''}>{row.receiptNo} · {(row.amountMinor/100).toFixed(2)}</span>{row.status==='issued'&&<button onClick={()=>void refund(row)} className="font-medium text-red-700">Refund</button>}</div>)}</div>}</div>}</div>;
}

function ReconciliationTab(){const client=usePortalClient();const{scope}=useScope();const[date,setDate]=useState(new Date().toISOString().slice(0,10));type Data={dailyRegister:{totalMinor:number;byMethod:Record<string,number>;receipts:Array<{id:string;receiptNo:string;amountMinor:number;method:string;status:string}>};defaulters:Array<{studentId:string;name:string;admissionNo:string;amountMinor:number;days:number}>;aging:Record<string,{amountMinor:number;count:number}>;clearance:Array<{id:string;amount:number;method:string;version:number;reference?:string|null}>;unmatched:Array<{id:string;gateway:string;providerEventId:string;outcome:string}>;pendingWaivers:Array<{id:string;label:string;amountMinor:number;version:number}>;pendingRefunds:Array<{id:string;receiptNo:string;refundAmountMinor:number;version:number}>;paymentDisputes:Array<{id:string;humanCode:string}>;failedReceiptRenders:Array<{id:string;title:string;error:string|null}>};const[data,setData]=useState<Data>();const[error,setError]=useState('');const[message,setMessage]=useState('');async function load(){return client.get<Data>(`/portal/fees/reconciliation?date=${date}`,scope).then(setData).catch(e=>setError(formatPortalError(e)));}useEffect(()=>{void load();},[client,scope,date]);async function exportFile(format:'csv'|'tally'|'quickbooks'){try{const blob=await client.fetchFile(`/portal/fees/reconciliation/export?format=${format}&date=${date}`,scope);const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`fees-${date}-${format}.${format==='tally'?'xml':'csv'}`;a.click();URL.revokeObjectURL(url);}catch(e){setError(formatPortalError(e,'Export failed.'));}}async function remind(){if(!data?.defaulters.length)return;const result=await client.post<{sent:number;skipped:number}>('/portal/fees/reconciliation/reminders',scope,{student_ids:data.defaulters.map(row=>row.studentId)});setMessage(`${result.sent} reminders sent · ${result.skipped} skipped (already reminded today or no portal account).`);}async function act(path:string,body:unknown={}){try{await client.post(path,scope,body);setMessage('Action recorded.');await load();}catch(e){setError(formatPortalError(e,'Action failed.'));}}return <div className="mx-auto max-w-5xl p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Reconciliation</h1><p className="text-sm text-text-muted">Daily register, defaulters, aging and gateway exceptions.</p></div><input type="date" value={date} onChange={e=>setDate(e.target.value)} className="rounded-md border border-border px-3 py-2"/></div>{error&&<p className="mt-4 text-red-700">{error}</p>}{message&&<p className="mt-4 rounded-md bg-surface-muted p-3 text-sm">{message}</p>}<div className="mt-4 flex flex-wrap gap-2">{(['csv','tally','quickbooks'] as const).map(format=><button key={format} onClick={()=>void exportFile(format)} className="rounded-md border border-border px-3 py-2 text-sm font-medium">Export {format==='quickbooks'?'QuickBooks CSV':format.toUpperCase()}</button>)}</div><div className="mt-6 grid gap-3 sm:grid-cols-3"><div className="rounded-lg border border-border p-4"><p className="text-sm text-text-muted">Issued total</p><p className="mt-1 text-2xl font-semibold">{((data?.dailyRegister.totalMinor??0)/100).toFixed(2)}</p></div><div className="rounded-lg border border-border p-4"><p className="text-sm text-text-muted">Pending clearance</p><p className="mt-1 text-2xl font-semibold">{data?.clearance.length??0}</p></div><div className="rounded-lg border border-border p-4"><p className="text-sm text-text-muted">Unmatched gateway events</p><p className="mt-1 text-2xl font-semibold">{data?.unmatched.length??0}</p></div></div><h2 className="mt-7 font-semibold">Daily register</h2><div className="mt-2 overflow-hidden rounded-lg border border-border">{data?.dailyRegister.receipts.map(r=><div key={r.id} className="flex justify-between border-b border-border px-4 py-3 text-sm"><span className={r.status==='cancelled'?'line-through opacity-60':''}>{r.receiptNo} · {r.method}</span><span>{(r.amountMinor/100).toFixed(2)}</span></div>)}</div>{Boolean(data?.clearance.length)&&<><h2 className="mt-7 font-semibold">Clearance queue</h2><div className="mt-2 rounded-lg border border-border">{data?.clearance.map(row=><div key={row.id} className="flex items-center justify-between gap-3 border-b border-border p-3 text-sm"><span>{row.method} · {(row.amount/100).toFixed(2)} · {row.reference??'no reference'}</span><div className="flex gap-2"><button onClick={()=>void act(`/portal/fees/payments/${row.id}/clear`,{version:row.version})} className="font-medium text-green-700">Mark cleared</button><button onClick={()=>{const reason=window.prompt('Reason for return (at least 10 characters)');if(reason)void act(`/portal/fees/payments/${row.id}/bounce`,{reason,add_bounce_fee:true});}} className="font-medium text-red-700">Mark bounced</button></div></div>)}</div></>}{Boolean(data?.failedReceiptRenders.length)&&<><h2 className="mt-7 font-semibold text-red-700">Failed receipt files</h2><div className="mt-2 rounded-lg border border-red-200">{data?.failedReceiptRenders.map(row=><div key={row.id} className="flex items-center justify-between gap-3 border-b border-red-100 p-3 text-sm"><span>{row.title} · {row.error??'Render failed'}</span><button onClick={()=>void act(`/portal/fees/reconciliation/receipt-renders/${row.id}/retry`)} className="font-medium text-red-700">Retry</button></div>)}</div></>}{Boolean(data?.pendingWaivers.length||data?.pendingRefunds.length||data?.paymentDisputes.length)&&<><h2 className="mt-7 font-semibold">Second approvals & disputes</h2><div className="mt-2 rounded-lg border border-border">{data?.pendingWaivers.map(row=><div key={row.id} className="flex justify-between border-b border-border p-3 text-sm"><span>{row.label} · {(row.amountMinor/100).toFixed(2)}</span><button onClick={()=>void act(`/portal/fees/waivers/${row.id}/approve`,{version:row.version,note:'Approved after independent review.'})} className="font-medium text-green-700">Approve</button></div>)}{data?.pendingRefunds.map(row=><div key={row.id} className="flex justify-between border-b border-border p-3 text-sm"><span>Refund {row.receiptNo} · {((row.refundAmountMinor??0)/100).toFixed(2)}</span><button onClick={()=>void act(`/portal/fees/receipts/${row.id}/refund/approve`,{version:row.version,note:'Approved after independent review.'})} className="font-medium text-green-700">Approve</button></div>)}{data?.paymentDisputes.map(row=><div key={row.id} className="flex justify-between border-b border-border p-3 text-sm"><span>{row.humanCode}</span><div className="flex gap-2"><button onClick={()=>void act(`/portal/fees/disputes/${row.id}/resolve`,{outcome:'captured',note:'Gateway evidence confirms capture.'})} className="font-medium text-green-700">Mark captured</button><button onClick={()=>void act(`/portal/fees/disputes/${row.id}/resolve`,{outcome:'reversed',note:'Bank evidence confirms reversal.'})} className="font-medium text-text-muted">Mark reversed</button></div></div>)}</div></>}<div className="mt-7 flex items-center justify-between"><h2 className="font-semibold">Defaulters</h2><button disabled={!data?.defaulters.length} onClick={()=>void remind()} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Send reminders</button></div><div className="mt-2 overflow-hidden rounded-lg border border-border">{data?.defaulters.map(row=><div key={row.studentId} className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-border px-4 py-3 text-sm"><span>{row.name} · {row.admissionNo}</span><span>{row.days} days</span><span>{(row.amountMinor/100).toFixed(2)}</span></div>)}</div><h2 className="mt-7 font-semibold">Aging</h2><div className="mt-2 grid gap-3 sm:grid-cols-4">{Object.entries(data?.aging??{}).map(([key,value])=><div key={key} className="rounded-lg border border-border p-3"><p className="text-xs text-text-muted">{key} days</p><p className="font-semibold">{(value.amountMinor/100).toFixed(2)}</p><p className="text-xs text-text-muted">{value.count} invoices</p></div>)}</div></div>;}

export default function FeesPage() {
  const [tab, setTab] = useState<'invoices' | 'structures' | 'collections' | 'reconciliation'>('invoices');

  return (
    <>
      <div className="flex gap-1 border-b border-border px-5 pt-3">
        {(['invoices', 'structures','collections','reconciliation'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={
              'rounded-t-md px-3 py-2 text-sm font-medium capitalize transition-colors ' +
              (tab === t ? 'border-b-2 border-primary text-text-primary' : 'text-text-muted hover:text-text-primary')
            }
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'invoices' ? <InvoicesTab /> : tab==='structures'?<StructuresTab/>:tab==='collections'?<CollectionsTab/>:<ReconciliationTab/>}
    </>
  );
}
