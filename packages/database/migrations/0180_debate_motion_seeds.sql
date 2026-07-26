-- Seed system debate motions (Tier 3 depth).

INSERT INTO debate_motions (origin, text, themes, difficulty, format_hints)
SELECT 'system', motion, themes, difficulty, format_hints
FROM (VALUES
  ('This house would ban homework in secondary schools.', ARRAY['education','wellbeing']::text[], 2, ARRAY['practice_solo','spar_1v1']::text[]),
  ('This house believes AI tutors improve learning outcomes more than they harm critical thinking.', ARRAY['technology','education']::text[], 3, ARRAY['practice_solo']::text[]),
  ('This house would make community service compulsory for university admission.', ARRAY['civics','education']::text[], 3, ARRAY['spar_1v1']::text[]),
  ('This house regrets the rise of influencer culture among teenagers.', ARRAY['culture','social_media']::text[], 2, ARRAY['practice_solo']::text[]),
  ('This house would subsidise public transport instead of private vehicle ownership.', ARRAY['environment','economics']::text[], 3, ARRAY['spar_1v1']::text[]),
  ('This house believes exams are a fairer measure of ability than coursework.', ARRAY['education','assessment']::text[], 2, ARRAY['practice_solo','spar_1v1']::text[]),
  ('This house would introduce a four-day school week.', ARRAY['education','wellbeing']::text[], 2, ARRAY['practice_solo']::text[]),
  ('This house believes privacy is more important than national security surveillance.', ARRAY['rights','technology']::text[], 4, ARRAY['spar_1v1']::text[]),
  ('This house would ban single-use plastics entirely.', ARRAY['environment']::text[], 2, ARRAY['practice_solo']::text[]),
  ('This house believes universal basic income is preferable to targeted welfare.', ARRAY['economics','society']::text[], 4, ARRAY['spar_1v1']::text[]),
  ('This house would lower the voting age to sixteen.', ARRAY['civics','rights']::text[], 3, ARRAY['practice_solo']::text[]),
  ('This house regrets the commercialisation of sport.', ARRAY['culture','economics']::text[], 3, ARRAY['practice_solo']::text[]),
  ('This house believes social media companies should be legally liable for harmful content.', ARRAY['technology','law']::text[], 4, ARRAY['spar_1v1']::text[]),
  ('This house would prioritise mental health services over academic rankings in schools.', ARRAY['wellbeing','education']::text[], 2, ARRAY['practice_solo']::text[]),
  ('This house believes nuclear energy is essential for a green transition.', ARRAY['environment','science']::text[], 4, ARRAY['spar_1v1']::text[]),
  ('This house would abolish legacy university admissions preferences.', ARRAY['education','equality']::text[], 3, ARRAY['practice_solo']::text[]),
  ('This house believes gig work empowers workers more than it exploits them.', ARRAY['economics','labour']::text[], 3, ARRAY['spar_1v1']::text[]),
  ('This house would mandate financial literacy as a graduation requirement.', ARRAY['education','economics']::text[], 2, ARRAY['practice_solo']::text[]),
  ('This house believes cultural appropriation is primarily harmful.', ARRAY['culture','rights']::text[], 4, ARRAY['spar_1v1']::text[]),
  ('This house would replace GDP with wellbeing indices as the primary policy goal.', ARRAY['economics','wellbeing']::text[], 4, ARRAY['practice_solo']::text[]),
  ('This house believes streaming students by ability helps everyone.', ARRAY['education']::text[], 3, ARRAY['practice_solo','spar_1v1']::text[]),
  ('This house would ban advertising aimed at children.', ARRAY['economics','rights']::text[], 3, ARRAY['spar_1v1']::text[]),
  ('This house believes remote work should be a legal right where feasible.', ARRAY['labour','technology']::text[], 3, ARRAY['practice_solo']::text[]),
  ('This house regrets the decline of print news.', ARRAY['media','civics']::text[], 2, ARRAY['practice_solo']::text[]),
  ('This house would make organ donation opt-out rather than opt-in.', ARRAY['health','rights']::text[], 3, ARRAY['spar_1v1']::text[]),
  ('This house believes meritocracy is a myth that harms social mobility.', ARRAY['society','equality']::text[], 4, ARRAY['practice_solo']::text[]),
  ('This house would tax meat to fund climate adaptation.', ARRAY['environment','economics']::text[], 4, ARRAY['spar_1v1']::text[]),
  ('This house believes schools should teach philosophy before sixteen.', ARRAY['education']::text[], 2, ARRAY['practice_solo']::text[]),
  ('This house would criminalise deepfake pornography without exception.', ARRAY['technology','law']::text[], 3, ARRAY['spar_1v1']::text[]),
  ('This house believes competitive debating should be compulsory in schools.', ARRAY['education','culture']::text[], 1, ARRAY['practice_solo']::text[])
) AS seed(motion, themes, difficulty, format_hints)
WHERE NOT EXISTS (SELECT 1 FROM debate_motions WHERE origin = 'system' LIMIT 1);
