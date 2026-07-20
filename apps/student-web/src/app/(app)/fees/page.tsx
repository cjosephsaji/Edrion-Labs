'use client';
import { useEffect, useMemo, useState } from 'react';
import { useStudentClient } from '@/lib/student-client';
import { useTerminology } from '@/lib/portal-config';
import { EmptyState } from '@/components/ui/empty-state';
import { Eyebrow, PageHeader } from '@/components/ui/primitives';

type FeeItem = { id: string; kind: string; label: string; amountMinor: number;taxMinor:number };
type Invoice = { id: string; invoiceNo: string; amount: number; amountPaid: number; balanceMinor: number; status: string; dueDate: string | null; items: FeeItem[];lateFeeProjection:{mode:string;startsOn:string;amountMinor:number;capMinor:number|null}|null };
type Receipt = { id: string; receiptNo: string; amountMinor: number; method: string; issuedAt: string; status: string; cancelledReason?: string | null; pdfStorageRef?: string | null };
type Home = { currency: string; balanceMinor: number; overdueMinor: number; partialPaymentAllowed: boolean; nextDueDate: string | null; duesBlocked: { hallTicket: boolean; result: boolean; tc: boolean }; invoices: Invoice[] };
type History = { receipts: Receipt[]; balanceMinor: number; currency: string };
type PaymentIntent = { intentId:string;provider:string;providerRef:string|null;status:string;amountMinor:number;currency:string;checkout?:{keyId:string} };
type RazorpayResult = { razorpay_payment_id:string;razorpay_order_id:string;razorpay_signature:string };

const cacheKey = 'student-fees:last-good';
const money = (minor: number, currency: string) => new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(minor / 100);
const loadRazorpay=async()=>{const host=window as typeof window&{Razorpay?:new(options:Record<string,unknown>)=>{open:()=>void}};if(host.Razorpay)return host.Razorpay;await new Promise<void>((resolve,reject)=>{const existing=document.querySelector<HTMLScriptElement>('script[data-edrion-razorpay]');if(existing){existing.addEventListener('load',()=>resolve(),{once:true});existing.addEventListener('error',()=>reject(new Error('Secure payment window could not be loaded.')),{once:true});return;}const script=document.createElement('script');script.src='https://checkout.razorpay.com/v1/checkout.js';script.async=true;script.dataset.edrionRazorpay='true';script.onload=()=>resolve();script.onerror=()=>reject(new Error('Secure payment window could not be loaded.'));document.head.appendChild(script);});if(!host.Razorpay)throw new Error('Secure payment window is unavailable.');return host.Razorpay;};

export default function FeesPage() {
  const client = useStudentClient();
  const t = useTerminology();
  const [tab, setTab] = useState<'home' | 'history'>('home');
  const [home, setHome] = useState<Home>();
  const [history, setHistory] = useState<History>();
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string>();
  const [paying, setPaying] = useState(false);
  const [paySheet,setPaySheet]=useState(false);const[selectedInvoices,setSelectedInvoices]=useState<string[]>([]);const[payAmount,setPayAmount]=useState(0);
  const [intent, setIntent] = useState<PaymentIntent>();
  const [statement,setStatement]=useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const [next, receipts] = await Promise.all([client.get<Home>('/fees'), client.get<History>('/fees/history')]);
      setHome(next); setHistory(receipts); setOffline(false);
      localStorage.setItem(cacheKey, JSON.stringify({ home: next, history: receipts, at: Date.now() }));
    } catch {
      const cached = localStorage.getItem(cacheKey);
      if (cached) { const value = JSON.parse(cached) as { home: Home; history: History }; setHome(value.home); setHistory(value.history); setOffline(true); }
      else setError(`Couldn't load your ${t('fee_word', { case: 'lower' })}.`);
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);
  const open = useMemo(() => home?.invoices.filter((row) => row.balanceMinor > 0 && row.status !== 'cancelled') ?? [], [home]);
  const selectedBalance=useMemo(()=>open.filter(row=>selectedInvoices.includes(row.id)).reduce((sum,row)=>sum+row.balanceMinor,0),[open,selectedInvoices]);
  useEffect(()=>{if(!home)return;const ids=home.invoices.filter(row=>row.balanceMinor>0&&row.status!=='cancelled').map(row=>row.id);setSelectedInvoices(ids);setPayAmount(home.balanceMinor);},[home]);
  useEffect(()=>{if(!home?.partialPaymentAllowed)return;setPayAmount(current=>Math.max(open[0]?.balanceMinor??0,Math.min(current,selectedBalance)));},[home?.partialPaymentAllowed,open,selectedBalance]);
  useEffect(()=>{if(!intent||!['initiated','pending'].includes(intent.status))return;let polls=0;const timer=window.setInterval(()=>{polls+=1;void client.get<typeof intent>(`/fees/intents/${intent.intentId}`).then(next=>{setIntent(next);if(next.status==='settled'){window.clearInterval(timer);void load();}if(['failed','expired','debited_unconfirmed'].includes(next.status))window.clearInterval(timer);}).catch(()=>undefined);if(polls>=45)window.clearInterval(timer);},4000);return()=>window.clearInterval(timer);},[client,intent?.intentId,intent?.status]);

  async function pay() {
    if (!home || !open.length || offline) return;
    setPaying(true); setError('');
    try {
      const key = crypto.randomUUID();
      const result = await client.request<PaymentIntent>('/fees/intents', {
        method: 'POST', headers: { 'idempotency-key': key }, body: JSON.stringify({ amount_minor: payAmount, invoice_ids: selectedInvoices }),
      });
      setIntent(result);
      if(result.provider==='razorpay'&&result.providerRef&&result.checkout?.keyId){
        const Razorpay=await loadRazorpay();
        await new Promise<void>((resolve,reject)=>{const checkout=new Razorpay({key:result.checkout!.keyId,order_id:result.providerRef,amount:result.amountMinor,currency:result.currency,name:'Edrion',description:`${t('fee_word')} payment`,handler:(response:RazorpayResult)=>{void client.request<PaymentIntent>(`/fees/intents/${result.intentId}/confirm`,{method:'POST',body:JSON.stringify({payment_id:response.razorpay_payment_id,signature:response.razorpay_signature})}).then(confirmed=>{setIntent(confirmed);setPaySheet(false);return load();}).then(()=>resolve()).catch(reject);},modal:{ondismiss:()=>resolve()},retry:{enabled:true},theme:{color:'#173D34'}});checkout.open();});
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Payment could not be started.'); }
    finally { setPaying(false); }
  }
  async function makeStatement(){setStatement('Preparing statement…');try{await client.post('/fees/statement');setStatement('Your statement is being prepared and will be filed in Documents.');}catch{setStatement('Statement could not be prepared. Try again.');}}

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader eyebrow={<Eyebrow>ACCOUNT</Eyebrow>} title={t('fee_word')} />
      <div className="mt-5 flex gap-1 rounded-xl bg-st-soft p-1" role="tablist">
        {(['home','history'] as const).map((value) => <button key={value} onClick={() => setTab(value)} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${tab === value ? 'bg-st-card text-st-ink shadow-sm' : 'text-st-muted'}`}>{value === 'home' ? 'Home' : 'History'}</button>)}
      </div>
      {offline && <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">Showing the last saved balance · offline. Payments are disabled.</p>}
      {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error} <button className="ml-2 underline" onClick={() => void load()}>Retry</button></div>}
      {loading ? <div className="mt-8 space-y-3"><div className="h-40 shimmer rounded-[15px]"/><div className="h-16 shimmer rounded-[15px]"/><div className="h-16 shimmer rounded-[15px]"/></div> : tab === 'home' ? (
        !home?.invoices.length ? <EmptyState className="mt-8" eyebrow="ALL CLEAR" title={`No ${t('fee_word', { case: 'lower' })} have been assigned yet`} description="New charges will appear here."/> : <>
          <section className={`mt-6 rounded-[18px] border p-5 ${home.overdueMinor > 0 ? 'border-red-200 bg-red-50' : home.balanceMinor ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-st-muted">{home.balanceMinor ? (home.overdueMinor ? 'Past due' : 'Amount due') : 'All clear ✓'}</p>
            <p className="mt-1 text-4xl font-bold tracking-tight text-st-ink">{money(home.balanceMinor, home.currency)}</p>
            <p className="mt-2 text-sm text-st-muted">{home.balanceMinor ? `Next due ${home.nextDueDate ?? 'soon'}` : 'You have no outstanding balance.'}</p>
            {(home.duesBlocked.hallTicket || home.duesBlocked.result || home.duesBlocked.tc) && <p className="mt-3 rounded-lg bg-red-100 px-3 py-2 text-sm font-medium text-red-900">An academic document is on hold until dues are cleared.</p>}
            {home.balanceMinor > 0 && <button disabled={paying || offline} onClick={() => setPaySheet(true)} className="mt-5 w-full rounded-xl bg-st-ink px-4 py-3 font-semibold text-white disabled:opacity-50">{`Pay ${money(home.balanceMinor, home.currency)}`}</button>}
            {paySheet&&<div className="mt-4 rounded-xl border border-st-bd1 bg-st-card p-4 text-sm"><p className="font-semibold">Choose what to pay</p><div className="mt-3 space-y-2">{open.map((invoice,index)=><label key={invoice.id} className="flex items-center justify-between gap-3"><span><input type="checkbox" className="mr-2" disabled={index===0||!home.partialPaymentAllowed} checked={selectedInvoices.includes(invoice.id)} onChange={e=>setSelectedInvoices(e.target.checked?[...selectedInvoices,invoice.id]:selectedInvoices.filter(id=>id!==invoice.id))}/>{invoice.invoiceNo}{index===0?' · oldest':''}</span><span>{money(invoice.balanceMinor,home.currency)}</span></label>)}</div><label className="mt-3 block">Amount<input type="number" min={(open[0]?.balanceMinor??1)/100} max={selectedBalance/100} disabled={!home.partialPaymentAllowed} value={payAmount/100} onChange={e=>setPayAmount(Math.round(Number(e.target.value)*100))} className="mt-1 w-full rounded-lg border border-st-bd1 px-3 py-2"/></label>{!home.partialPaymentAllowed&&<p className="mt-1 text-xs text-st-muted">Partial payments are disabled by policy.</p>}<div className="mt-3 flex gap-2"><button disabled={paying||payAmount<(open[0]?.balanceMinor??1)||payAmount>selectedBalance||!selectedInvoices.length} onClick={()=>void pay()} className="rounded-lg bg-st-ink px-4 py-2 font-semibold text-white disabled:opacity-50">{paying?'Starting…':'Continue to pay'}</button><button onClick={()=>setPaySheet(false)} className="px-3 py-2 text-st-muted">Cancel</button></div></div>}
            {intent && <div className="mt-4 rounded-xl border border-st-bd1 bg-st-card p-3 text-sm"><p className="font-semibold">{intent.status==='debited_unconfirmed'?'Your bank debit is being checked':intent.status==='failed'?"The payment didn't go through":`Complete the payment in the secure ${intent.provider} window.`}</p><p className="mt-1 text-st-muted">{intent.status==='debited_unconfirmed'?"We've automatically raised a payment dispute. Open Requests to track it.":intent.status==='failed'?'If your bank confirms no debit, you can safely try again.':`Status: ${intent.status} · We’ll keep checking for up to 3 minutes.`}</p></div>}
          </section>
          <div className="mt-5 space-y-2">
            {home.invoices.map((invoice) => <article key={invoice.id} className="rounded-[15px] border border-st-bd1 bg-st-card">
              <button onClick={() => setExpanded(expanded === invoice.id ? undefined : invoice.id)} className="flex w-full items-start justify-between gap-3 px-4 py-3.5 text-left">
                <div><p className="font-semibold text-st-ink">{invoice.invoiceNo}</p><p className="mt-1 text-xs text-st-muted">{invoice.dueDate ? `Due ${invoice.dueDate}` : 'No due date'} · {invoice.status}</p>{invoice.lateFeeProjection&&<p className="mt-1 text-xs text-amber-700">{invoice.lateFeeProjection.mode==='per_day'?`${money(invoice.lateFeeProjection.amountMinor,home.currency)}/day`:`${money(invoice.lateFeeProjection.amountMinor,home.currency)} late fee`} from {invoice.lateFeeProjection.startsOn}{invoice.lateFeeProjection.capMinor?` · up to ${money(invoice.lateFeeProjection.capMinor,home.currency)}`:''}</p>}</div>
                <span className="font-semibold text-st-ink">{money(invoice.balanceMinor, home.currency)}</span>
              </button>
              {expanded === invoice.id && <div className="border-t border-st-bd1 px-4 py-3"><p className="mb-2 text-xs font-semibold uppercase text-st-faint">What’s this made of?</p>{invoice.items.map((item) => <div key={item.id} className={`flex justify-between py-1 text-sm ${item.amountMinor < 0 ? 'text-emerald-700' : 'text-st-muted'}`}><span>{item.label}{item.taxMinor>0?' · incl. tax':''}</span><span>{money(item.amountMinor+item.taxMinor, home.currency)}</span></div>)}</div>}
            </article>)}
          </div>
        </>
      ) : !history?.receipts.length ? <EmptyState className="mt-8" eyebrow="NO PAYMENTS" title="No payments yet" description="Receipts will be filed here automatically."/> : <div className="mt-5 space-y-2"><button onClick={()=>void makeStatement()} className="mb-2 w-full rounded-xl border border-st-bd1 bg-st-card px-4 py-3 text-sm font-semibold text-st-ink">Statement (PDF)</button>{statement&&<p className="rounded-lg bg-st-soft px-3 py-2 text-xs text-st-muted">{statement}</p>}{history.receipts.map((receipt) => <article key={receipt.id} className={`rounded-[15px] border border-st-bd1 bg-st-card px-4 py-3.5 ${receipt.status === 'cancelled' ? 'opacity-60' : ''}`}><div className="flex justify-between gap-3"><div><p className={`font-semibold text-st-ink ${receipt.status==='cancelled'?'line-through':''}`}>{receipt.receiptNo}</p><p className="text-xs text-st-muted">{new Date(receipt.issuedAt).toLocaleDateString()} · {receipt.method}</p></div><span className="font-semibold">{money(receipt.amountMinor, history.currency)}</span></div>{receipt.cancelledReason && <p className="mt-2 text-xs text-red-700">Cancelled: {receipt.cancelledReason}</p>}{receipt.pdfStorageRef&&<a href={client.resourceUrl(`/fees/receipts/${receipt.id}/file`)} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-st-accentDeep">Download receipt (PDF)</a>}</article>)}</div>}
    </div>
  );
}
