'use client';
import Link from 'next/link';
import { api } from '@/lib/guardian/api';
import { useState } from 'react';
import { Card, Section, Button } from '@/components/guardian/ui';
import { CalendarDays, Users, FileText, UserCog, Settings, Eye, Mail, MessageSquarePlus } from 'lucide-react';

const links = [
  { href: '/family/more/ptm', label: 'Parent-teacher meetings', icon: Users },
  { href: '/family/more/calendar', label: 'School calendar', icon: CalendarDays },
  { href: '/family/more/messages/new', label: 'Message the school', icon: MessageSquarePlus },
  { href: '/family/more/document-requests', label: 'Document requests', icon: FileText },
  { href: '/family/more/profile-changes', label: 'Profile change requests', icon: UserCog },
  { href: '/family/more/settings', label: 'Settings & notifications', icon: Settings },
  { href: '/family/more/who-can-see', label: 'Who can see what', icon: Eye },
];

export default function MorePage() {
  const [preview, setPreview] = useState<'idle' | 'sending' | 'sent' | 'rate'>('idle');
  async function sendPreview() {
    setPreview('sending');
    try {
      await api.post('/digest/preview');
      setPreview('sent');
    } catch (e) {
      setPreview((e as { status?: number }).status === 429 ? 'rate' : 'idle');
    }
  }
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">More</h1>
      <Section title="Do more">
        <div className="space-y-2">
          {links.map((l) => (
            <Link key={l.href} href={l.href}>
              <Card className="flex items-center gap-3"><l.icon className="text-brand" size={20} /><span className="text-sm font-medium flex-1">{l.label}</span><span className="text-muted">›</span></Card>
            </Link>
          ))}
        </div>
      </Section>
      <Section title="Weekly digest">
        <Card className="space-y-2">
          <p className="text-sm text-muted flex items-center gap-2"><Mail size={16} /> Get a summary of your week by email.</p>
          <Button variant="ghost" disabled={preview === 'sending'} onClick={sendPreview}>
            {preview === 'sending' ? 'Sending…' : preview === 'sent' ? 'Sent — check your email ✓' : preview === 'rate' ? 'Already sent recently' : 'Send me a preview now'}
          </Button>
        </Card>
      </Section>
    </div>
  );
}
