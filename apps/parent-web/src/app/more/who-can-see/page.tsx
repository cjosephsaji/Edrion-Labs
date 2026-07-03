import { Card, Section } from '@/components/ui';
import { Eye, EyeOff } from 'lucide-react';

const shown = [
  'Attendance, including whether an absence is explained',
  'Homework, published exam results and datesheets',
  'Fees, fines and payment receipts',
  'Health-room visits, medical incidents and the medication log',
  'Behaviour notes the school has published, and all recognitions',
  'Transport, library and hostel information',
  'Pickup authorizations and gate exit/entry activity',
  'School-published documents and certificates',
];

const hidden = [
  'Counseling case notes or records — you only ever see a counselor’s contact if they choose to share it',
  'A nurse’s private free-text notes (you see the structured what-happened / action-taken)',
  'Other families’ children — you only ever see your own ward(s)',
  'Behaviour incidents that have not been published to guardians',
  'Any section your school has restricted for your specific account',
];

export default function WhoCanSeePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Who can see what</h1>
      <p className="text-sm text-muted">We want to be honest about exactly what this app shows you — and what it never shows.</p>

      <Section title="What we show you">
        <Card className="space-y-2">
          {shown.map((s, i) => (
            <div key={i} className="flex items-start gap-2 text-sm"><Eye size={16} className="text-good shrink-0 mt-0.5" /><span>{s}</span></div>
          ))}
        </Card>
      </Section>

      <Section title="What we never show">
        <Card className="space-y-2">
          {hidden.map((s, i) => (
            <div key={i} className="flex items-start gap-2 text-sm"><EyeOff size={16} className="text-muted shrink-0 mt-0.5" /><span>{s}</span></div>
          ))}
        </Card>
      </Section>

      <p className="text-xs text-muted">Every access is scoped to your children, and every change you make is recorded in the school’s audit log.</p>
    </div>
  );
}
