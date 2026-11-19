import {
  cloneProject,
  deletePart,
  duplicatePart,
  findPart,
  newPart,
  reparent,
  shapes,
  uniqueId,
  validateProject,
  type Project,
  type Proposal,
  type Shape,
  type Vec3,
} from './maker-project';

/** Explicit command grammar, labeled separately from generative AI. No partial matching. */
export function localProposal(
  project: Project,
  selected: string | null,
  input: string,
): Proposal | null {
  const text = input
      .trim()
      .replace(/[×,]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\.$/, '')
      .toLowerCase(),
    next = cloneProject(project);
  const target = (id: string) =>
    id === 'selected' || id === 'it' ? (selected ?? '') : id;
  const number = '(-?\\d+(?:\\.\\d+)?)',
    name = '([a-z][a-z0-9_-]*|selected|it)';
  let match: RegExpMatchArray | null,
    explanation =
      'The project geometry and measurements are recalculated from the new conditions.';
  if (
    (match = text.match(
      new RegExp(
        `^add (?:a |an )?(${shapes.join('|')})(?: named ([a-z][a-z0-9_-]*))?(?: size)? ${number} (?:x )?${number} (?:x )?${number} (mm|cm)$`,
      ),
    ))
  ) {
    const part = newPart(
      match[1] as Shape,
      match[2] ?? uniqueId(next, match[1]),
    );
    const unit = match[6] === 'cm' ? 10 : 1;
    part.size = [+match[3] * unit, +match[4] * unit, +match[5] * unit];
    part.position = [90, part.size[1] / 2, 0];
    next.parts.push(part);
  } else if (
    (match = text.match(
      new RegExp(
        `^(?:set|make) ${name} (width|height|depth|x|y|z|rpm|teeth)(?: to)? ${number}(?: (mm|cm|rpm))?$`,
      ),
    ))
  ) {
    const p = findPart(next, target(match[1])),
      key = match[2],
      unit = match[4] === 'cm' ? 10 : 1,
      value = +match[3] * unit;
    if (key === 'rpm') {
      p.rpm = value;
      p.motion = 'spin';
      explanation =
        'RPM specifies driven angular speed, not available torque. This preview does not solve motor loads.';
    } else if (key === 'teeth') p.teeth = value;
    else if (['x', 'y', 'z'].includes(key))
      p.position[['x', 'y', 'z'].indexOf(key)] = value;
    else p.size[['width', 'height', 'depth'].indexOf(key)] = value;
  } else if (
    (match = text.match(
      new RegExp(`^(double|halve) (?:the )?(width|height|depth) of ${name}$`),
    ))
  ) {
    findPart(next, target(match[3])).size[
      ['width', 'height', 'depth'].indexOf(match[2])
    ] *= match[1] === 'double' ? 2 : 0.5;
    explanation =
      'Scaling one dimension scales solid volume and estimated mass by the same factor when material and the other dimensions stay fixed.';
  } else if (
    (match = text.match(
      new RegExp(`^make ${name} (wider|taller|deeper) by ${number} (mm|cm)$`),
    ))
  ) {
    findPart(next, target(match[1])).size[
      ['wider', 'taller', 'deeper'].indexOf(match[2])
    ] += +match[3] * (match[4] === 'cm' ? 10 : 1);
  } else if (
    (match = text.match(
      new RegExp(`^move ${name} by ${number} ${number} ${number} (mm|cm)$`),
    ))
  ) {
    const p = findPart(next, target(match[1])),
      v = [+match[2], +match[3], +match[4]];
    p.position = p.position.map(
      (n, i) => n + v[i] * (match![5] === 'cm' ? 10 : 1),
    ) as Vec3;
  } else if (
    (match = text.match(
      new RegExp(
        `^rotate ${name} by ${number} ${number} ${number}(?: degrees)?$`,
      ),
    ))
  ) {
    const p = findPart(next, target(match[1]));
    p.rotation = p.rotation.map((n, i) => n + Number(match![i + 2])) as Vec3;
  } else if (
    (match = text.match(
      new RegExp(`^spin ${name} (?:around )?([xyz]) (?:at )?${number} rpm$`),
    ))
  ) {
    const p = findPart(next, target(match[1]));
    p.motion = 'spin';
    p.axis = match[2] as 'x';
    p.rpm = +match[3];
    explanation =
      'Attached children inherit this driven rotation. It demonstrates kinematics; no airflow or mechanical load is calculated.';
  } else if (
    (match = text.match(
      new RegExp(`^(?:color|colour) ${name} (#[a-f0-9]{6})$`),
    ))
  )
    findPart(next, target(match[1])).color = match[2];
  else if (
    (match = text.match(
      new RegExp(`^attach ${name} to ([a-z][a-z0-9_-]*|world)$`),
    ))
  )
    return {
      project: reparent(
        next,
        target(match[1]),
        match[2] === 'world' ? null : match[2],
      ),
      summary: input,
      explanation:
        'The part keeps its world position, then follows its new parent during motion.',
      question:
        'Which parts should move together, and where should their pivot be?',
      source: 'command',
    };
  else if (
    (match = text.match(new RegExp(`^(duplicate|remove|delete) ${name}$`)))
  )
    return {
      project:
        match[1] === 'duplicate'
          ? duplicatePart(next, target(match[2]))
          : deletePart(next, target(match[2])),
      summary: input,
      explanation:
        'This is a reversible project edit. Undo restores the previous assembly.',
      question: 'How does this change the assembly’s function?',
      source: 'command',
    };
  else return null;
  return {
    project: validateProject(next),
    summary: input,
    explanation,
    question:
      'What did you expect to change? Compare the measurements before applying.',
    source: 'command',
  };
}
